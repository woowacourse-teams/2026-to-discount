package com.discounttracker.banner;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.LocalDate;
import java.util.List;

/**
 * 화면 맨 위에 띄우는 당일 행사 한 건.
 *
 * <p>원장(export.json)에서 파생되지 않는다. "당일 행사·특별 할인"은 정의상
 * 상시 오퍼 목록에 없는 것을 알리는 자리라, 오퍼 데이터에 묶으면 정작
 * 띄우고 싶은 앱 전체 이벤트나 첫 주문 쿠폰을 못 띄운다. 사람이
 * {@code banners.yml}에 직접 적는다.
 *
 * @param brand    브랜드 대표명. 없으면(null) 앱 전체 행사다.
 * @param platform 원장 platform 값과 같은 키(baemin, coupangeats, ...). {@link #OWN}이면
 *                 브랜드 자체 앱이나 사이트의 행사다(2026-09-18). 파일에서 비우면 OWN이 된다.
 *                 배지와 색 폴백이 이 값을 쓴다.
 * @param amount   화면에 쓰는 금액 문구("최대 8,000원"). 파일의 {@code amount:} 덩이({@link #amountSpec})에서
 *                 {@code BannerText}가 만든다.
 * @param period   금액 우측 상단에 붙는 기간 문구("9월 24일 하루"). 시각 칸에서 만든다.
 * @param extra    부가 조건 문구. 없으면 null이고 화면에서 그 줄이 사라진다.
 * @param minOrder 최소주문금액. 적어두면 이 배너가 오퍼로 설 때 조건으로 함께 들어간다.
 * @param color    브랜드색 강제 지정. 없으면 로고에서 뽑고, 그마저 실패하면
 *                 플랫폼 색으로 간다(프론트 brandColor.js).
 * @param soldOut   기간 내내 다 나간 상태로 둘 때 켠다. 하루짜리 배너가
 *                  아니면 거의 쓸 일이 없다.
 * @param soldOutOn 그 날짜에만 다 나간 것으로 본다. 선착순은 매일 다시
 *                  풀리므로 보통 이쪽을 쓴다 — soldOut을 켜 두면 다음 날
 *                  아침에도 매진으로 떠서, 늦지 않았는데 늦었다고 말한다.
 *
 *                  배너를 내리지 않고 남기는 이유는 없어진 것과 다 나간
 *                  것이 다른 소식이기 때문이다 — "오늘은 늦었다"를 알아야
 *                  내일 일찍 온다.
 * @param priority 낮을수록 먼저. 안 적으면 {@link #DEFAULT_PRIORITY}.
 * @param brands   한 장에 묶인 브랜드들(선택). 같은 행사를 여러 브랜드가 같은
 *                 금액으로 할 때 한 장으로 띄우려고 둔다(2026-09-15: 쿠팡이츠
 *                 60계·처갓집·반올림 8,000원). 프론트가 로고를 여럿 그린다.
 *                 비어 있으면 {@code brand} 하나다. {@code brand}는 비교 카드에
 *                 얹을 때와 색을 뽑을 때 쓰는 대표 브랜드로 남는다 — 안 적으면
 *                 첫 번째가 대표다.
 */
public record Banner(
        String id,
        String brand,
        String platform,
        String url,
        String amount,
        String period,
        String extra,
        Integer minOrder,
        String color,
        java.time.LocalDateTime startsAt,
        java.time.LocalDateTime endsAt,
        Boolean soldOut,
        LocalDate soldOutOn,
        int priority,
        List<String> brands,
        // 구조 필드(설계 25). 문장 칸이 비면 여기서 문구를 만든다. 응답에도 그대로 실린다.
        BannerSpec spec,
        // 알림 두 칸은 서버 안에서만 쓴다(BannerNotificationService). 응답에 실리던 것을
        // 뺐다 - 웹도 콘솔 수집기도 안 읽는다(감사 2026-09-29 #7).
        @JsonIgnore Boolean notifyFlag,
        @JsonIgnore Boolean notifyImmediately,
        // 화면에 쓸 짧은 이름. brands와 같은 순서다. 로고와 원장은 brands(대표명)를 쓰고,
        // 글자만 이쪽을 쓴다 — 배너 한 장에 브랜드가 넷이면 긴 이름이 줄을 넘긴다
        // (2026-09-22 사용자: 후라이드참잘하는집 -> 후참잘).
        List<String> brandLabels,
        // 2026-09-22 재설계. 같은 값을 적은 배너끼리 한 장으로 그린다.
        String group,
        // 제휴 결제 수단(naverpay 등). 아이콘만 바꾼다. 필터에는 안 들어간다.
        String via,
        // 무엇을 얼마나. 문자열 amount와 spec.amountRange를 대신한다.
        BannerAmount amountSpec,
        // 개인 지정 쿠폰인가. 자격이지 수량 제한이 아니다.
        Boolean targeted,
        // 선착순 기준. issue(발급), use(사용), null
        String firstCome,
        // 소진되면 끝인가.
        Boolean untilSoldOut,
        // 묶음 카드의 구성원(2026-09-29). BannerCatalog.active()가 접은 카드에만 있다.
        // 묶음은 링크, 기간, 플랫폼이 같은 배너들이라(확정 규칙 4절) 그 셋은 카드의 것이고,
        // 구성원마다 다른 브랜드, 금액, 최소주문, 여는 시각, 소진만 여기 남긴다. 접지 않은 배너는 null이다.
        List<Member> members) {

    /**
     * 묶음 카드 구성원 한 명. 대표도 첫 자리에 들어간다.
     *
     * <p>{@code opensAt}("HH:MM")은 그 구성원이 여는 시각이다. 쿠팡이츠 선착순 오픈은 하루치를
     * 한 장으로 묶어(2026-09-30 사용자 결정) 구성원마다 시각이 다르다. 없으면 null.
     */
    public record Member(String id, String brand, String brandLabel, String amount,
                         Integer minOrder, Boolean soldOut, String opensAt) {
    }

    static final int DEFAULT_PRIORITY = 999;

    /** 배달앱 밖, 브랜드 자체 앱이나 사이트의 행사. 앱 배지 없이 그리고 오퍼 비교에서 뺀다. */
    public static final String OWN = "own";

    @JsonIgnore
    public boolean isOwn() {
        return platform == null || OWN.equals(platform);
    }

    /**
     * 칸이 많아 순서로 쓰면 틀린다. 2026-09-22에 같은 날 두 사람이 이 record에 칸을 더했고
     * (웹 푸시의 notify 둘, 화면용 brandLabels 하나), 인자 수가 달라진 호출부를 컴파일러가
     * 하나씩 잡아 줘야 했다. 이름으로 적으면 칸이 늘어도 기존 호출부가 그대로 선다.
     *
     * <pre>Banner.of("id", "https://...").brand("교촌치킨").platform("baemin").build()</pre>
     */
    public static Builder of(String id, String url) {
        return new Builder(id, url);
    }

    /** 이 배너에서 한 칸만 바꾼 사본. */
    public Builder toBuilder() {
        return new Builder(id, url).brand(brand).platform(platform).amount(amount)
                .period(period).extra(extra).minOrder(minOrder).color(color)
                .startsAt(startsAt).endsAt(endsAt).soldOut(soldOut).soldOutOn(soldOutOn)
                .priority(priority).brands(brands).spec(spec)
                .notify(notifyFlag).notifyImmediately(notifyImmediately).brandLabels(brandLabels)
                .group(group).via(via).amountSpec(amountSpec)
                .targeted(targeted).firstCome(firstCome).untilSoldOut(untilSoldOut)
                .members(members);
    }

    public static final class Builder {
        private final String id;
        private final String url;
        private String brand;
        private String platform;
        private String amount;
        private String period;
        private String extra;
        private Integer minOrder;
        private String color;
        private java.time.LocalDateTime startsAt;
        private java.time.LocalDateTime endsAt;
        private Boolean soldOut;
        private LocalDate soldOutOn;
        private int priority = DEFAULT_PRIORITY;
        private List<String> brands;
        private BannerSpec spec;
        private Boolean notify;
        private Boolean notifyImmediately;
        private List<String> brandLabels;
        private String group;
        private String via;
        private BannerAmount amountSpec;
        private Boolean targeted;
        private String firstCome;
        private Boolean untilSoldOut;
        private List<Member> members;

        private Builder(String id, String url) {
            this.id = id;
            this.url = url;
        }

        public Builder brand(String v) { this.brand = v; return this; }
        public Builder platform(String v) { this.platform = v; return this; }
        public Builder amount(String v) { this.amount = v; return this; }
        public Builder period(String v) { this.period = v; return this; }
        public Builder extra(String v) { this.extra = v; return this; }
        public Builder minOrder(Integer v) { this.minOrder = v; return this; }
        public Builder color(String v) { this.color = v; return this; }
        public Builder startsAt(java.time.LocalDateTime v) { this.startsAt = v; return this; }
        public Builder endsAt(java.time.LocalDateTime v) { this.endsAt = v; return this; }
        /** 날짜만 아는 경우. 그날 00:00이다. 변환기가 쓰는 규칙과 같다. */
        public Builder startsOn(LocalDate v) { this.startsAt = v == null ? null : v.atStartOfDay(); return this; }
        /**
         * 날짜만 아는 경우. 그날 23:59:59다 - 초 단위까지 채워야 그날이 끝날 때까지
         * 산다. 23:59로 채우면 23:59:01부터 만료로 읽혀, 날짜 대신 시각을 쓴
         * 이유(그날 포함 여부를 안 따지게)가 59초짜리 구멍으로 되살아난다.
         * {@code endsAt}을 직접 적은 사람은 이 메서드를 거치지 않으니 자기가 적은
         * 값 그대로 받는다.
         */
        public Builder endsOn(LocalDate v) { this.endsAt = v == null ? null : v.atTime(23, 59, 59); return this; }
        public Builder soldOut(Boolean v) { this.soldOut = v; return this; }
        public Builder soldOutOn(LocalDate v) { this.soldOutOn = v; return this; }
        public Builder priority(int v) { this.priority = v; return this; }
        public Builder brands(List<String> v) { this.brands = v; return this; }
        public Builder spec(BannerSpec v) { this.spec = v; return this; }
        public Builder notify(Boolean v) { this.notify = v; return this; }
        public Builder notifyImmediately(Boolean v) { this.notifyImmediately = v; return this; }
        public Builder brandLabels(List<String> v) { this.brandLabels = v; return this; }
        public Builder group(String v) { this.group = v; return this; }
        public Builder via(String v) { this.via = v; return this; }
        public Builder amountSpec(BannerAmount v) { this.amountSpec = v; return this; }
        public Builder targeted(Boolean v) { this.targeted = v; return this; }
        public Builder firstCome(String v) { this.firstCome = v; return this; }
        public Builder untilSoldOut(Boolean v) { this.untilSoldOut = v; return this; }
        public Builder members(List<Member> v) { this.members = v; return this; }

        /**
         * 기간 두 칸을 검사한다(백로그 #5, 2026-09-29). {@link #activeAt}, {@link #startsOn},
         * {@link #endsOn}이 두 칸을 그대로 쓰므로 하나라도 비면 요청 처리 중에 NPE가 난다.
         * 끝이 시작보다 앞이면 한 번도 뜨지 않는다. 파일을 읽는 {@code BannerCatalog}는
         * 이 예외를 받아 그 한 장만 {@code dropped}로 돌린다.
         */
        public Banner build() {
            if (startsAt == null || endsAt == null) {
                throw new IllegalArgumentException("배너 " + id + ": startsAt과 endsAt이 둘 다 있어야 한다");
            }
            if (endsAt.isBefore(startsAt)) {
                throw new IllegalArgumentException("배너 " + id + ": endsAt(" + endsAt
                        + ")이 startsAt(" + startsAt + ")보다 앞이다");
            }
            return new Banner(id, brand, platform, url, amount, period, extra, minOrder, color,
                    startsAt, endsAt, soldOut, soldOutOn, priority, brands, spec,
                    notify, notifyImmediately, brandLabels,
                    group, via, amountSpec, targeted, firstCome, untilSoldOut, members);
        }
    }

    /** 이 배너가 덮는 브랜드 전부 — brands가 있으면 그것, 없으면 brand 하나. */
    public List<String> allBrands() {
        if (brands != null && !brands.isEmpty()) return brands;
        return brand == null ? List.of() : List.of(brand);
    }

    /** 그날 다 나갔나. 기간 전체를 덮는 soldOut과 그날치 soldOutOn 중 하나면 참. */
    public boolean soldOutOn(LocalDate today) {
        return Boolean.TRUE.equals(soldOut) || today.equals(soldOutOn);
    }

    /** 응답에는 오늘 기준으로 판정한 값 하나만 싣는다 — 프론트가 날짜를 다시 따지지 않게. */
    public Banner resolvedFor(LocalDate today) {
        boolean out = soldOutOn(today);
        return Boolean.valueOf(out).equals(soldOut) && soldOutOn == null
                ? this
                : toBuilder().soldOut(out).soldOutOn(null).build();
    }

    public boolean notificationEnabled() {
        return Boolean.TRUE.equals(notifyFlag);
    }

    public boolean immediateNotificationRequested() {
        return Boolean.TRUE.equals(notifyImmediately);
    }

    /** 배너를 보여 줄 기간 안인가. 시각까지 본다 - 17시 오픈 행사가 17시에 뜬다. */
    public boolean activeAt(java.time.LocalDateTime now) {
        return !now.isBefore(startsAt) && !now.isAfter(endsAt);
    }

    /** 시작 날짜. 시각을 쓰기 전 코드가 부르던 이름 그대로다. */
    public LocalDate startsOn() {
        return startsAt.toLocalDate();
    }

    /** 종료 날짜. 오퍼의 expiresAt이 이 값을 쓴다. */
    public LocalDate endsOn() {
        return endsAt.toLocalDate();
    }

    public boolean isTargeted() {
        return Boolean.TRUE.equals(targeted);
    }

    public boolean untilSoldOutFlag() {
        return Boolean.TRUE.equals(untilSoldOut);
    }
}
