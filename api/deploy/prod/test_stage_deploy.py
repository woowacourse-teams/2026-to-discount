import os
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import stage_deploy as sd

KST = timezone(timedelta(hours=9))
STAGE = "delivery-discount-api-stage.service"


class FakeOps(sd.Ops):
    """서버 없이 순서만 본다. 이벤트는 문자열(동작)과 ('sleep', 초) 튜플로 쌓인다."""

    def __init__(self, *, health, now=None, active=(), fail=(), prev=None):
        self.events = []
        self._health = health
        self.clock = now or datetime(2026, 10, 27, 3, 0, tzinfo=KST)
        self.active = set(active)
        self.fail = set(fail)
        self.links = {"current": Path(prev)} if prev else {}
        self.restarts = 0

    def now(self):
        return self.clock

    def sleep(self, seconds):
        self.events.append(("sleep", round(seconds)))
        self.clock += timedelta(seconds=seconds)

    def systemctl(self, action, unit):
        key = f"{action}:{'stage' if 'stage' in unit else 'primary'}"
        self.events.append(key)
        if key in self.fail:
            raise subprocess.CalledProcessError(1, key)
        if action == "start":
            self.active.add(unit)
        elif action == "stop":
            self.active.discard(unit)
        elif action == "restart":
            self.restarts += 1

    def is_active(self, unit):
        return unit in self.active

    def healthy(self, port):
        return self._health(self, port)

    def link(self, link, target):
        which = "stage" if link.name == "stage.jar" else "current"
        self.links[which] = Path(target)
        self.events.append(f"link:{which}:{Path(target).name}")

    def readlink(self, link):
        return self.links.get("stage" if link.name == "stage.jar" else "current")


def acts(ops):
    return [e for e in ops.events if isinstance(e, str)]


class DeployTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        d = Path(self.tmp.name)
        self.jar = d / "delivery-discount-api-abc1234.jar"
        self.jar.write_bytes(b"jar")
        self.cfg = sd.Config(deploy_dir=d, stage_ready_s=3, primary_ready_s=3, failback_wait_s=15)
        self.logs = []

    def run_deploy(self, ops):
        return sd.deploy(self.cfg, ops, self.jar, log=self.logs.append)

    def test_success_keeps_the_stage_alive_while_primary_restarts(self):
        ops = FakeOps(health=lambda o, p: True, prev="/d/delivery-discount-api-old.jar")
        self.assertEqual(self.run_deploy(ops), sd.OK)
        ev = acts(ops)
        # 임시 인스턴스가 준비된 뒤에만 본 인스턴스를 재시작하고, 본 인스턴스가 준비된 뒤에만 임시 인스턴스를 내린다
        self.assertLess(ev.index("start:stage"), ev.index("restart:primary"))
        self.assertLess(ev.index("restart:primary"), ev.index("stop:stage"))
        self.assertEqual(ev.count("restart:primary"), 1)
        # 임시 인스턴스와 본 인스턴스 모두 새 jar를 가리킨다
        self.assertEqual(ops.links["stage"].name, self.jar.name)
        self.assertEqual(ops.links["current"].name, self.jar.name)
        # 본 인스턴스가 돌아올 시간을 주고 내린다
        self.assertIn(("sleep", 15), ops.events)
        self.assertLess(ops.events.index(("sleep", 15)), ops.events.index("stop:stage"))

    def test_stage_not_ready_leaves_primary_untouched(self):
        ops = FakeOps(health=lambda o, p: p != 8089, prev="/d/old.jar")
        self.assertEqual(self.run_deploy(ops), sd.STAGE_FAILED)
        ev = acts(ops)
        self.assertNotIn("restart:primary", ev)
        self.assertIn("stop:stage", ev)
        self.assertNotIn("link:current", " ".join(ev))
        self.assertEqual(ops.links["current"], Path("/d/old.jar"))

    def test_stage_start_command_failure_leaves_primary_untouched(self):
        ops = FakeOps(health=lambda o, p: True, fail={"start:stage"})
        self.assertEqual(self.run_deploy(ops), sd.STAGE_FAILED)
        self.assertNotIn("restart:primary", acts(ops))

    def test_primary_not_ready_rolls_back_to_previous_jar(self):
        # 8088은 되돌린 재시작(두 번째)이 끝나야 준비된다
        ops = FakeOps(health=lambda o, p: p == 8089 or o.restarts >= 2, prev="/d/delivery-discount-api-old.jar")
        self.assertEqual(self.run_deploy(ops), sd.ROLLED_BACK)
        ev = acts(ops)
        self.assertEqual(ev.count("restart:primary"), 2)
        self.assertEqual(ops.links["current"].name, "delivery-discount-api-old.jar")
        self.assertEqual(ev[-1], "stop:stage")
        # 되돌리는 동안에도 임시 인스턴스는 살아 있다(두 번째 재시작보다 stop이 뒤)
        self.assertLess(len(ev) - 1 - ev[::-1].index("restart:primary"), ev.index("stop:stage"))

    def test_rollback_failure_keeps_the_stage_as_lifeline(self):
        ops = FakeOps(health=lambda o, p: p == 8089, prev="/d/old.jar")
        self.assertEqual(self.run_deploy(ops), sd.NEEDS_HUMAN)
        self.assertNotIn("stop:stage", acts(ops))

    def test_first_deploy_without_previous_jar_cannot_roll_back(self):
        ops = FakeOps(health=lambda o, p: p == 8089, prev=None)
        self.assertEqual(self.run_deploy(ops), sd.NEEDS_HUMAN)
        self.assertEqual(acts(ops).count("restart:primary"), 1)
        self.assertNotIn("stop:stage", acts(ops))

    def test_waits_out_the_push_window(self):
        now = datetime(2026, 10, 27, 11, 10, tzinfo=KST)
        ops = FakeOps(health=lambda o, p: True, now=now, prev="/d/old.jar")
        self.assertEqual(self.run_deploy(ops), sd.OK)
        # 11:35까지 25분을 먼저 기다리고, 그 뒤에 임시 인스턴스를 시작한다
        self.assertEqual(ops.events[0], ("sleep", 25 * 60))
        self.assertLess(ops.events.index(("sleep", 25 * 60)), ops.events.index("start:stage"))

    def test_no_wait_outside_the_push_window_or_with_guard_off(self):
        for now, guard in ((datetime(2026, 10, 27, 10, 59, tzinfo=KST), True),
                           (datetime(2026, 10, 27, 11, 35, tzinfo=KST), True),
                           (datetime(2026, 10, 27, 11, 10, tzinfo=KST), False)):
            self.cfg.guard_window = guard
            ops = FakeOps(health=lambda o, p: True, now=now, prev="/d/old.jar")
            self.run_deploy(ops)
            self.assertFalse([e for e in ops.events if isinstance(e, tuple) and e[1] > 100], (now, guard))

    def test_leftover_stage_is_stopped_first(self):
        ops = FakeOps(health=lambda o, p: True, active={STAGE}, prev="/d/old.jar")
        self.assertEqual(self.run_deploy(ops), sd.OK)
        ev = acts(ops)
        self.assertEqual(ev[0], "stop:stage")
        self.assertLess(ev.index("stop:stage"), ev.index("start:stage"))

    def test_warns_when_primary_was_already_down(self):
        ops = FakeOps(health=lambda o, p: p == 8089 or o.restarts >= 1, prev="/d/old.jar")
        self.assertEqual(self.run_deploy(ops), sd.OK)
        self.assertTrue(any("무중단이 아닐 수" in m for m in self.logs))

    def test_missing_jar_does_nothing(self):
        ops = FakeOps(health=lambda o, p: True)
        self.assertEqual(sd.deploy(self.cfg, ops, Path(self.tmp.name) / "nope.jar", log=self.logs.append), sd.STAGE_FAILED)
        self.assertEqual(ops.events, [])


class WaitHealthyTest(unittest.TestCase):
    def test_returns_the_second_it_became_ready(self):
        ops = FakeOps(health=lambda o, p: len([e for e in o.events if isinstance(e, tuple)]) >= 2)
        self.assertEqual(sd.wait_healthy(ops, 8088, 10), 3)

    def test_returns_none_when_it_never_does(self):
        ops = FakeOps(health=lambda o, p: False)
        self.assertIsNone(sd.wait_healthy(ops, 8088, 4))


class PruneTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.d = Path(self.tmp.name)
        self.cfg = sd.Config(deploy_dir=self.d)
        self.jars = []
        for i in range(5):
            j = self.d / f"delivery-discount-api-{i:07d}.jar"
            j.write_bytes(b"x")
            os.utime(j, (1_700_000_000 + i, 1_700_000_000 + i))
            self.jars.append(j)

    def test_keeps_only_the_newest_three(self):
        sd.prune(self.cfg, lambda m: None)
        self.assertEqual(sorted(p.name for p in self.d.glob("*.jar")), sorted(j.name for j in self.jars[2:]))

    def test_never_deletes_what_a_link_points_to(self):
        try:
            (self.d / "current.jar").symlink_to(self.jars[0])
        except OSError:
            self.skipTest("심볼릭 링크를 만들 수 없는 환경")
        sd.prune(self.cfg, lambda m: None)
        self.assertTrue(self.jars[0].exists())
        self.assertFalse(self.jars[1].exists())


class RealLinkTest(unittest.TestCase):
    def test_link_replaces_atomically_and_readlink_follows(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t)
            a, b = d / "a.jar", d / "b.jar"
            a.write_bytes(b"a")
            b.write_bytes(b"b")
            link = d / "current.jar"
            ops = sd.Ops()
            try:
                ops.link(link, a)
            except OSError:
                self.skipTest("심볼릭 링크를 만들 수 없는 환경")
            self.assertEqual(ops.readlink(link).name, "a.jar")
            ops.link(link, b)
            self.assertEqual(ops.readlink(link).name, "b.jar")
            self.assertFalse((d / "current.jar.next").exists())


if __name__ == "__main__":
    unittest.main()
