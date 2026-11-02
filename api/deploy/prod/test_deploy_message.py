import contextlib
import io
import unittest

import deploy_message as dm
import stage_deploy as sd

SHA = "3936a03b" + "0" * 32
URL = "https://github.com/nn98/delivery-discount-api/actions/runs/1"
REPO = "nn98/delivery-discount-api"


class DeployMessageTest(unittest.TestCase):
    def test_texts_match_the_confirmed_wording(self):
        self.assertEqual(dm.MESSAGES, {
            0: "정상적으로 배포가 완료되었습니다",
            1: "임시 인스턴스가 구동 실패했습니다",
            2: "배포 중 예외가 발생해 이전 버전으로 복구됐습니다",
            3: "오류가 발생했습니다. 직접 확인이 필요합니다",
        })

    def test_body_has_repo_short_sha_and_run_url(self):
        for code, text in dm.MESSAGES.items():
            self.assertEqual(
                dm.build(code, REPO, SHA, URL),
                f"{text}\n저장소: {REPO}\n커밋: 3936a03\n실행: {URL}",
            )

    def test_code_may_arrive_as_string(self):
        self.assertEqual(dm.build("2", REPO, SHA, URL), dm.build(2, REPO, SHA, URL))

    def test_keys_equal_stage_deploy_exit_codes(self):
        self.assertEqual(
            set(dm.MESSAGES),
            {sd.OK, sd.STAGE_FAILED, sd.ROLLED_BACK, sd.NEEDS_HUMAN},
        )

    def test_unknown_codes_give_none(self):
        for code in (4, 255, -1, "", "abc", None):
            self.assertIsNone(dm.build(code, REPO, SHA, URL), code)

    def test_cli_prints_message(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = dm.main(["x", "0", REPO, SHA, URL])
        self.assertEqual(rc, 0)
        self.assertEqual(out.getvalue(), dm.build(0, REPO, SHA, URL) + "\n")

    def test_cli_unknown_code_prints_nothing_and_exits_10(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = dm.main(["x", "abc", REPO, SHA, URL])
        self.assertEqual((rc, out.getvalue()), (10, ""))

    def test_cli_wrong_arg_count_exits_10(self):
        self.assertEqual(dm.main(["x", "0"]), 10)


if __name__ == "__main__":
    unittest.main()
