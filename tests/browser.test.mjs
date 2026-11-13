import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";

const url = process.env.POLIS_TEST_URL ?? "http://127.0.0.1:3000";
const text = "원문에 기록된 구간과 관측 시점을 비교했습니다.";
const correction = "비교 시점을 더 명확하게 표현하기 위해 정정합니다.";
const title = "시민 교통 정책 브라우저 테스트";

test("mobile demo: independent review, publishing, correction, discussion and moderation", { timeout: 90_000 }, async (t) => {
  const browser = await chromium.launch({ channel: process.env.POLIS_TEST_BROWSER ?? "chrome" });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10_000);
  const exceptions = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  const button = (name) => page.getByRole("button", { name, exact: true });
  const heading = (name) => page.getByRole("heading", { name, exact: true });
  const label = (name) => page.getByLabel(name, { exact: true });
  const visit = (hash) => page.goto(url + "/#" + hash);

  async function role(role, name) {
    await visit("account");
    await button(role).click();
    await page.getByRole("button", { name: role, exact: true, pressed: true }).waitFor();
    if (!(await heading(name).isVisible())) {
      await label("공개 닉네임").fill(name);
      await label("이용 규칙에 동의합니다").check();
      await label("개인정보 안내에 동의합니다").check();
      await button("동의하고 참여하기").click();
    }
    await heading(name).waitFor();
  }
  async function studio() {
    await visit("studio");
    await page.getByRole("combobox", { name: "주제 선택" }).selectOption({ label: title });
  }
  async function review(version) {
    await label("원문과 인용을 대조한 기록").fill(text);
    await button("출처 검수 완료").click();
    await button("발행 승인").click();
    await page.getByText("v" + version + " · 발행 승인", { exact: true }).waitFor();
  }
  async function publish() {
    await studio();
    await button("공개 발행").click();
    await page.getByRole("link", { name: /공개 버전 v[12] 보기/ }).waitFor();
    await button("공개 발행").waitFor({ state: "hidden" });
  }

  await visit("home");
  await heading(/정책을 읽고/).waitFor();
  await page.getByRole("link", { name: /런던 혼잡통행료/ }).first().click();
  await heading("관측된 성과").waitFor();
  await heading("한계와 해석").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await visit("learn");
  await label("정책 검색").fill("결과없음");
  await page.getByText("조건에 맞는 공개 정책이 없습니다.").waitFor();

  await visit("compare");
  await heading("비교할 발행본이 더 필요합니다").waitFor();
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "시민 교실" }).click();
  await page.getByText("검수와 발행을 마친 수업이 여기에 표시됩니다.").waitFor();

  await role("편집자", "시험 편집자");
  await visit("studio");
  await button("새 학습 주제").click();
  await label("정책 제목").fill(title);
  for (const name of ["정책 요약", "정책의 배경", "관측된 성과", "한계와 해석", "토론 질문"]) await label(name).fill(text);
  await button("초안 만들기").click();
  await studio();
  await page.locator("summary").filter({ hasText: /^출처 등록$/ }).click();
  await label("자료명").fill("교통 관측 보고서");
  await label("발행 기관").fill("런던교통공사");
  await label("원문 주소 (HTTPS)").fill("https://content.tfl.gov.uk/central-london-congestion-charging-impacts-monitoring-sixth-annual-report.pdf");
  await label("원문 위치와 인용 근거").fill(text);
  await button("출처 등록").click();
  await button("검수 요청").click();
  await page.getByText("v1 · 검수 중").waitFor();
  await visit("learn");
  assert.equal(await heading(title).count(), 0);

  await role("검수자", "시험 검수자");
  await studio();
  assert.equal(await button("발행 승인").isDisabled(), true);
  await review(1);

  await role("발행 운영자", "시험 운영자");
  await publish();
  const topicHash = await page.getByRole("link", { name: "공개 버전 v1 보기" }).getAttribute("href");
  assert.ok(topicHash);
  await role("시민", "시험 시민");
  await visit(topicHash.slice(1));
  await label("의견 유형").selectOption("question");
  await label("의견과 근거").fill("대체 교통수단별 관측 자료를 함께 읽어보고 싶습니다.");
  await button("의견 게시").click();
  const opinion = page.getByText("대체 교통수단별 관측 자료를 함께 읽어보고 싶습니다.");
  await opinion.waitFor();
  await label("표시할 의견").selectOption("alternative");
  await page.getByText("이 유형의 공개 의견이 없습니다.").waitFor();
  await label("표시할 의견").selectOption("question");
  await opinion.waitFor();

  await role("편집자", "시험 편집자");
  await studio();
  await label("공개할 정정 사유").fill(correction);
  await button("정정 초안 만들기").click();
  await button("검수 요청").click();
  await page.getByText("v2 · 검수 중").waitFor();
  await visit(topicHash.slice(1));
  await page.getByText(/교통 · v1/).waitFor();
  await button("신고").click();
  await label("신고 사유").fill("테스트 환경에서 신고 처리 흐름을 확인합니다.");
  await button("신고 보내기").click();
  await button("신고 보내기").waitFor({ state: "hidden" });

  await role("검수자", "시험 검수자");
  await studio();
  await review(2);
  await page.getByRole("combobox", { name: "처리 방법" }).selectOption("hide");
  await label("처리 근거").fill("테스트 게시물 숨김으로 신고 처리를 검증합니다.");
  await button("신고 처리").click();
  await page.getByText(/처리 완료/).waitFor();

  await role("발행 운영자", "시험 운영자");
  await publish();
  await visit(topicHash.slice(1));
  await page.getByText(/교통 · v2/).waitFor();
  await page.locator("summary").filter({ hasText: /버전 및 정정 이력/ }).click();
  await page.getByText(correction, { exact: true }).waitFor();
  await page.getByRole("link", { name: /^v1 · / }).click();
  await page.getByText(/이전 버전을 읽고 있습니다/).waitFor();
  await page.getByText("아직 공개 의견이 없습니다.").waitFor();
  await visit("compare");
  await label("첫 번째 발행본").selectOption({ label: title + " · v2" });
  await label("두 번째 발행본").selectOption({ label: title + " · v1" });
  await heading(title + " · v2").first().waitFor();
  await heading(title + " · v1").first().waitFor();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["home", "compare", "classroom"]) {
      await visit(route);
      await page.getByRole("heading", { level: 1, name: /정책을 읽고|정책 비교실|시민 교실/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, route + " at " + width);
    }
  }
  const lessonTitle = "차가 줄면 길도 덜 막힐까?";
  await role("편집자", "시험 편집자");
  await visit("studio");
  await page.locator("summary").filter({ hasText: "런던 사례 수업 초안 만들기" }).click();
  await button(lessonTitle).click();
  await heading(lessonTitle).waitFor();
  await button("검수 요청").click();
  await page.getByText("v1 · 검수 중").waitFor();
  await visit("classroom");
  await page.getByText("검수와 발행을 마친 수업이 여기에 표시됩니다.").waitFor();
  await role("검수자", "시험 검수자");
  await visit("studio");
  await page.getByRole("combobox", { name: "주제 선택" }).selectOption({ label: lessonTitle });
  await review(1);
  await role("발행 운영자", "시험 운영자");
  await visit("studio");
  await page.getByRole("combobox", { name: "주제 선택" }).selectOption({ label: lessonTitle });
  await button("공개 발행").click();
  await page.getByRole("link", { name: "공개 버전 v1 보기" }).waitFor();
  await visit("topic/london-congestion");
  await page.getByRole("link", { name: "3분 수업 · " + lessonTitle }).click();
  await heading(lessonTitle).waitFor();
  await page.getByRole("radio", { name: /같은 도로와 시간대/ }).check();
  await page.getByRole("status").filter({ hasText: "맞습니다." }).waitFor();
  await page.getByRole("link", { name: "정책 글에 적용하기" }).click();
  await page.waitForFunction(() => document.activeElement?.id === "results");
  await visit("learn");
  assert.equal(await heading(lessonTitle).count(), 0);
  assert.deepEqual(exceptions, []);

  const anonymous = await browser.newPage();
  await anonymous.goto(url + "/#learn");
  await anonymous.getByRole("heading", { name: /런던 혼잡통행료/ }).waitFor();
  assert.equal(await anonymous.getByRole("heading", { name: title }).count(), 0);
  await anonymous.goto(url + "/#classroom");
  await anonymous.getByText("검수와 발행을 마친 수업이 여기에 표시됩니다.").waitFor();
});

test("API rejects cross-origin writes and anonymous posting", async () => {
  const endpoint = url + "/api/polis";
  const send = (origin) => fetch(endpoint, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "comment", topic: "london-congestion", version: 1, body: text }),
  });
  assert.equal((await send("https://example.org")).status, 403);
  assert.equal((await send(url)).status, 401);
});
