import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POLIS | 근거로 읽는 정책",
  description: "정책의 성과와 한계를 함께 살펴보고 근거를 바탕으로 토론하는 시민 학습 공간",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
