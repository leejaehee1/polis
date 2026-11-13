import type { FormEvent } from "react";

const date = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });
export function formatDate(at: string) { return date.format(new Date(at)); }
export function formValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(Array.from(new FormData(event.currentTarget), ([key, value]) => [key, String(value)]));
}
