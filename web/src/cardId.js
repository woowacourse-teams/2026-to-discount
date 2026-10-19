// 브랜드 카드 딥링크용 id. 브랜드명 자체가 이미 유니크한 키라 그대로
// 쓰되, 공백만 앵커에서 다루기 까다로우니 치환한다.
export function brandCardId(name) {
  return `brand-${name.trim().replace(/\s+/g, '_')}`
}
