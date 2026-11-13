import { parseArgs } from "node:util";
import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      uid: { type: "string" },
      role: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const { project, uid, role, apply } = values;
  if (!project || project !== process.env.FIREBASE_PROJECT_ID || !uid || !["member", "editor", "reviewer", "admin"].includes(role)) {
    throw new Error("FIREBASE_PROJECT_ID와 같은 --project, 회원 --uid, --role member|editor|reviewer|admin을 지정하세요.");
  }

  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (emulator && (!project.startsWith("demo-") || !/^(localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(emulator))) {
    throw new Error("테스트 권한 변경은 로컬 Auth 에뮬레이터의 demo- 프로젝트에서만 실행할 수 있습니다.");
  }
  const app = initializeApp({ projectId: project, ...(emulator ? {} : { credential: applicationDefault() }) });
  try {
    const auth = getAuth(app);
    const user = await auth.getUser(uid);
    if (role !== "member" && (user.disabled || !user.emailVerified)) {
      throw new Error("이메일을 인증한 활성 계정에만 운영 역할을 부여할 수 있습니다.");
    }
    const claims = { ...user.customClaims };
    const before = claims.polisRole ?? "member";
    if (role === "member") delete claims.polisRole;
    else claims.polisRole = role;

    console.log(project + " / " + uid + " / " + before + " → " + role);
    if (!apply) {
      console.log("미리보기입니다. 변경을 적용하려면 --apply를 추가하세요.");
      return;
    }
    if (before !== role || (role === "member" && user.customClaims?.polisRole !== undefined)) {
      await auth.setCustomUserClaims(uid, claims);
    }
    await auth.revokeRefreshTokens(uid);
    console.log("역할을 저장하고 기존 세션을 만료했습니다. 회원이 다시 로그인하면 새 역할이 적용됩니다.");
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
