#!/usr/bin/env python3
"""운영 API 무중단 배포. 임시 인스턴스(stage)를 먼저 띄운 뒤, 그 사이 본 인스턴스를 교체한다.

순서(자세한 이유는 README.md):
  1. 임시 인스턴스(8089)를 새 jar로 띄워 준비될 때까지 기다린다. 실패하면 본 인스턴스는 건드리지 않는다.
  2. 본 인스턴스(8088)를 새 jar로 재시작한다. 이 약 5~8초 동안 nginx가 upstream의 `backup`인 임시 인스턴스로 넘긴다.
  3. 본 인스턴스가 준비되면, nginx가 본 인스턴스로 돌아올 시간을 주고 임시 인스턴스를 내린다.
  4. 본 인스턴스가 준비되지 않으면 이전 jar로 되돌려 재시작한다(임시 인스턴스가 그동안 받는다).

푸시 알림이 11:00~11:30(KST) 사이 아무 때나 나가므로, 두 인스턴스가 함께 떠 있는 이 스크립트는 그 시간대를 피한다.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, time as dtime, timedelta
from pathlib import Path

# 종료 코드
OK = 0
STAGE_FAILED = 1       # 임시 인스턴스가 안 떴다. 본 인스턴스는 그대로다.
ROLLED_BACK = 2        # 본 인스턴스가 안 떠서 이전 jar로 되돌렸다. 옛 버전이 돈다.
NEEDS_HUMAN = 3        # 되돌리기도 실패했다(임시 인스턴스를 켜 둔 채 끝낸다. 받아 줄 곳이 그것뿐이다). 또는 임시 인스턴스를 못 내렸다.


@dataclass
class Config:
    deploy_dir: Path
    primary_unit: str = "delivery-discount-api.service"
    stage_unit: str = "delivery-discount-api-stage.service"
    primary_port: int = 8088
    stage_port: int = 8089
    stage_ready_s: int = 60      # 새 jar가 뜨고 원장 첫 읽기(3~7초)까지 마치는 시간
    primary_ready_s: int = 30    # 기존 헬스체크와 같다. 2026-09-14 4.3초에 뜬 jar를 5초 헬스체크가 롤백한 일이 있었다
    failback_wait_s: int = 15    # nginx가 본 인스턴스를 다시 쓰기까지(fail_timeout 5초)와 여유
    keep_jars: int = 3
    window_start: dtime = dtime(11, 0)   # 푸시 요약이 나가는 시간대(KST)
    window_end: dtime = dtime(11, 35)    # 11:30까지 나가고 5분 여유
    guard_window: bool = True

    @property
    def current_link(self) -> Path:
        return self.deploy_dir / "current.jar"

    @property
    def stage_link(self) -> Path:
        return self.deploy_dir / "stage.jar"


class Ops:
    """서버에 닿는 동작 전부. 시험은 이 객체를 가짜로 바꾼다."""

    def now(self) -> datetime:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul"))

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)

    def systemctl(self, action: str, unit: str) -> None:
        cmd = ["sudo", "-n", "systemctl", action, unit]
        try:
            subprocess.run(cmd, check=True, timeout=120)
        except (subprocess.TimeoutExpired, OSError) as error:
            # 시간 초과, sudo나 systemctl이 없음 등도 "명령이 실패했다"로 통일한다. 호출부는 CalledProcessError만 처리한다.
            raise subprocess.CalledProcessError(1, cmd, stderr=str(error)) from error

    def is_active(self, unit: str) -> bool:
        try:
            r = subprocess.run(["systemctl", "is-active", "--quiet", unit], timeout=30)
        except (subprocess.TimeoutExpired, OSError):
            return False  # 모르면 켜져 있지 않다고 본다. 켜져 있었다면 다음 start가 실패해 STAGE_FAILED로 끝난다
        return r.returncode == 0

    def healthy(self, port: int) -> bool:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/brands", timeout=5) as r:
                return r.status == 200 and isinstance(json.load(r), list)
        except Exception:  # noqa: BLE001 - 어떤 실패든 "아직 아니다"다
            return False

    def link(self, link: Path, target: Path) -> None:
        tmp = link.with_name(link.name + ".next")
        tmp.unlink(missing_ok=True)
        tmp.symlink_to(target)
        os.replace(tmp, link)  # 원자적 교체: 링크가 없는 순간이 없다

    def readlink(self, link: Path) -> Path | None:
        try:
            return Path(os.path.realpath(link)) if link.is_symlink() else None
        except OSError:
            return None


def wait_healthy(ops: Ops, port: int, seconds: int) -> int | None:
    """1초마다 본다. 준비되면 걸린 초, 끝내 안 되면 None."""
    for i in range(1, seconds + 1):
        if ops.healthy(port):
            return i
        ops.sleep(1)
    return None


def wait_out_push_window(cfg: Config, ops: Ops, log) -> None:
    if not cfg.guard_window:
        return
    now = ops.now()
    start = now.replace(hour=cfg.window_start.hour, minute=cfg.window_start.minute, second=0, microsecond=0)
    end = now.replace(hour=cfg.window_end.hour, minute=cfg.window_end.minute, second=0, microsecond=0)
    if not (start <= now < end):
        return
    wait = (end - now).total_seconds()
    log(f"푸시 요약 시간대(11:00~11:30 KST)라 {int(wait)}초 기다린다. 두 인스턴스가 겹치면 푸시가 두 번 나갈 수 있다")
    ops.sleep(wait)


def stop_stage(cfg: Config, ops: Ops, log) -> bool:
    """임시 인스턴스를 내린다. 명령이 실패해도 예외로 새지 않고 False를 돌려준다(호출부가 종료 코드를 정한다)."""
    try:
        ops.systemctl("stop", cfg.stage_unit)
        return True
    except subprocess.CalledProcessError:
        log("임시 인스턴스를 내리지 못했다. 수동 확인이 필요하다")
        return False


def prune(cfg: Config, log) -> None:
    """최근 jar만 남긴다. 링크가 가리키는 파일은 지우지 않는다."""
    jars = sorted(cfg.deploy_dir.glob("delivery-discount-api-*.jar"), key=lambda p: p.stat().st_mtime, reverse=True)
    keep = set(jars[: cfg.keep_jars])
    for link in (cfg.current_link, cfg.stage_link):
        if link.is_symlink():
            keep.add(Path(os.path.realpath(link)))
    for jar in jars:
        if Path(os.path.realpath(jar)) not in keep:
            jar.unlink()
            log(f"오래된 jar 삭제: {jar.name}")


def deploy(cfg: Config, ops: Ops, jar: Path, log=print) -> int:
    jar = Path(jar)
    if not jar.is_file():
        log(f"jar가 없다: {jar}")
        return STAGE_FAILED

    wait_out_push_window(cfg, ops, log)

    # 지난 실행이 남긴 임시 인스턴스가 있으면 먼저 내린다(포트가 겹친다).
    if ops.is_active(cfg.stage_unit):
        log("남아 있던 임시 인스턴스를 먼저 내린다")
        if not stop_stage(cfg, ops, log):
            return STAGE_FAILED  # 포트가 겹쳐 새로 못 띄운다. 본 인스턴스는 그대로다

    if not ops.healthy(cfg.primary_port):
        log("경고: 배포 시작 시점에 본 인스턴스가 이미 준비 상태가 아니다. 이 배포는 무중단이 아닐 수 있다")

    # 1. 임시 인스턴스
    ops.link(cfg.stage_link, jar)
    log(f"임시 인스턴스를 새 jar로 시작: {jar.name}")
    try:
        ops.systemctl("start", cfg.stage_unit)
    except subprocess.CalledProcessError:
        log("임시 인스턴스 시작 명령이 실패했다. 본 인스턴스는 그대로다")
        return STAGE_FAILED
    took = wait_healthy(ops, cfg.stage_port, cfg.stage_ready_s)
    if took is None:
        log(f"임시 인스턴스가 {cfg.stage_ready_s}초 안에 준비되지 않았다. 내리고 끝낸다. 본 인스턴스는 그대로다")
        stop_stage(cfg, ops, log)
        return STAGE_FAILED
    log(f"임시 인스턴스 준비됨({took}초)")

    # 2. 본 인스턴스 교체. 이전 jar를 기록해 둔다(되돌릴 대상).
    prev = ops.readlink(cfg.current_link)
    ops.link(cfg.current_link, jar)
    log("본 인스턴스를 재시작한다. 이 동안 nginx가 임시 인스턴스로 넘긴다")
    restarted = True
    try:
        ops.systemctl("restart", cfg.primary_unit)
    except subprocess.CalledProcessError:
        restarted = False
    took = wait_healthy(ops, cfg.primary_port, cfg.primary_ready_s) if restarted else None

    if took is None:
        return _rollback(cfg, ops, prev, log)
    log(f"본 인스턴스 준비됨({took}초)")

    # 3. 본 인스턴스로 돌아올 시간을 준 뒤 임시 인스턴스를 내린다.
    ops.sleep(cfg.failback_wait_s)
    if not ops.healthy(cfg.primary_port):
        log("본 인스턴스가 다시 준비 상태가 아니다. 임시 인스턴스를 남겨 둔다")
        return NEEDS_HUMAN
    stopped = stop_stage(cfg, ops, log)
    if stopped:
        log("임시 인스턴스를 내렸다. 배포 끝")
    prune(cfg, log)  # 본 인스턴스는 이미 새 jar다. 링크가 가리키는 jar는 지우지 않는다
    return OK if stopped else NEEDS_HUMAN


def _rollback(cfg: Config, ops: Ops, prev: Path | None, log) -> int:
    log(f"본 인스턴스가 {cfg.primary_ready_s}초 안에 준비되지 않았다")
    if prev is None:
        log("이전 jar 기록이 없다(첫 배포). 되돌릴 곳이 없어 임시 인스턴스를 남겨 둔다. 수동 확인이 필요하다")
        return NEEDS_HUMAN
    log(f"이전 jar로 되돌린다: {prev.name}")
    ops.link(cfg.current_link, prev)
    try:
        ops.systemctl("restart", cfg.primary_unit)
    except subprocess.CalledProcessError:
        log("되돌리는 재시작 명령도 실패했다. 임시 인스턴스를 남겨 둔다. 수동 확인이 필요하다")
        return NEEDS_HUMAN
    if wait_healthy(ops, cfg.primary_port, cfg.primary_ready_s) is None:
        log("이전 jar도 준비되지 않았다. 임시 인스턴스를 남겨 둔다. 수동 확인이 필요하다")
        return NEEDS_HUMAN
    ops.sleep(cfg.failback_wait_s)
    if not stop_stage(cfg, ops, log):
        return NEEDS_HUMAN
    log("이전 버전으로 복구했다. 임시 인스턴스를 내렸다")
    return ROLLED_BACK


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="운영 API 무중단 배포(임시 인스턴스 교대)")
    p.add_argument("jar", help="새 jar의 경로(버전이 붙은 파일)")
    p.add_argument("--deploy-dir", default=os.environ.get("DEPLOY_DIR"), required=not os.environ.get("DEPLOY_DIR"),
                   help="jar와 링크(current.jar, stage.jar)가 있는 폴더. 환경변수 DEPLOY_DIR로도 준다")
    p.add_argument("--no-window-guard", action="store_true", help="푸시 시간대 대기를 건너뛴다(긴급 배포)")
    args = p.parse_args(argv)

    cfg = Config(deploy_dir=Path(args.deploy_dir), guard_window=not args.no_window_guard)
    import fcntl  # 리눅스 서버에서만 돈다. 시험은 deploy()를 직접 부른다

    cfg.deploy_dir.mkdir(parents=True, exist_ok=True)
    with (cfg.deploy_dir / ".deploy.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("다른 배포가 돌고 있다", file=sys.stderr)
            return STAGE_FAILED
        return deploy(cfg, Ops(), Path(args.jar))


if __name__ == "__main__":
    sys.exit(main())
