import { NextRequest, NextResponse } from "next/server";
import { commandSchema, consentVersion, PolicyError, publicTopic, roles } from "@/lib/policy";
import { createDemo, demoActor, firebaseActor, getDemo, readState, staffTopic, writeState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookie = "polis-demo";
const headers = { "Cache-Control": "private, no-store" };
function demoOrigin(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host)) return null;
  const address = request.nextUrl.protocol + "//" + host;
  return URL.canParse(address) ? new URL(address).origin : null;
}

const localEmulator = /^(?:127\.0\.0\.1|localhost):[0-9]{1,5}$/;

function mode(request: NextRequest) {
  const value = process.env.POLIS_MODE ?? "demo";
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (value === "firebase" && !authHost && !firestoreHost) return false;
  if (
    value === "firebase-emulator" && demoOrigin(request) &&
    process.env.FIREBASE_PROJECT_ID?.startsWith("demo-") &&
    localEmulator.test(authHost ?? "") && localEmulator.test(firestoreHost ?? "")
  ) return false;
  if (value === "demo" && demoOrigin(request)) return true;
  throw new PolicyError(503, "POLIS 실행 환경을 설정해 주세요. 데모는 로컬에서만 사용할 수 있습니다.");
}

function errorResponse(error: unknown) {
  if (error instanceof PolicyError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error("POLIS request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500, headers });
}

export async function GET(request: NextRequest) {
  try {
    const isDemo = mode(request);
    const demo = isDemo ? getDemo(request.cookies.get(cookie)?.value) : undefined;
    const actor = isDemo ? demoActor(demo) : await firebaseActor(request.headers.get("authorization"));
    const { topics, profile } = await readState(actor, demo, isDemo);
    return NextResponse.json({
      mode: isDemo ? "demo" : "firebase",
      ...(process.env.POLIS_MODE === "firebase-emulator" ? {
        authEmulator: "http://" + process.env.FIREBASE_AUTH_EMULATOR_HOST,
      } : {}),
      firebase: isDemo ? null : {
        projectId: process.env.FIREBASE_PROJECT_ID, apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN, appId: process.env.FIREBASE_APP_ID,
      },
      viewer: actor ? { role: actor.role, profile, consented: profile?.version === consentVersion } : null,
      topics: topics.map(publicTopic).filter(Boolean),
      staff: actor && actor.role !== "member" && profile?.version === consentVersion
        ? topics.map((topic) => staffTopic(topic, actor)) : [],
    }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const isDemo = mode(request);
    const origin = isDemo ? demoOrigin(request) : process.env.POLIS_ORIGIN;
    if (!origin) throw new PolicyError(503, "서비스 접속 주소 설정이 필요합니다.");
    if (request.headers.get("origin") !== origin) throw new PolicyError(403, "다른 사이트에서 보낸 요청입니다.");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new PolicyError(415, "지원하지 않는 요청 형식입니다.");
    const reader = request.body?.getReader();
    if (!reader) throw new PolicyError(400, "요청 내용이 비어 있습니다.");
    let bytes = 0;
    let raw = "";
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65_536) {
        await reader.cancel();
        throw new PolicyError(413, "요청 내용이 너무 큽니다.");
      }
      raw += decoder.decode(value, { stream: true });
    }
    let body;
    try {
      body = JSON.parse(raw + decoder.decode());
    } catch {
      throw new PolicyError(400, "요청 내용을 읽을 수 없습니다.");
    }
    let key = request.cookies.get(cookie)?.value;
    let demo = isDemo ? getDemo(key) : undefined;
    if (isDemo && body?.type === "demoRole") {
      const role = roles.find((item) => item === body.role) ?? null;
      if (!role && body.role !== null) throw new PolicyError(400, "데모 역할을 선택해 주세요.");
      if (!demo && role) ({ key, demo } = createDemo());
      if (demo) demo.role = role;
      const response = NextResponse.json({ ok: true }, { headers });
      if (key && demo) response.cookies.set(cookie, key, {
        httpOnly: true, sameSite: "strict", secure: request.nextUrl.protocol === "https:",
        path: "/", maxAge: 14_400,
      });
      return response;
    }
    const actor = isDemo ? demoActor(demo) : await firebaseActor(request.headers.get("authorization"));
    if (!actor) throw new PolicyError(401, "로그인해 주세요.");
    const command = commandSchema.safeParse(body);
    if (!command.success) throw new PolicyError(400, "입력 항목의 길이, 형식 및 필수 동의를 확인해 주세요.");
    await writeState(command.data, actor, demo);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
