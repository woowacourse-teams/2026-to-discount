package com.discounttracker.banner;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
 * @param amount   정수가 아니라 문자열이다 — "첫 주문 5,000원", "최대 30%"
 *                 같은 것을 담아야 하는데 정수로 두면 못 담고, 그러면 배너를
 *                 원장에서 떼어낸 이유가 사라진다.
 * @param period   금액 우측 상단에 붙는 기간 문구("8/11 하루만").
 * @param extra    부가 조건. 없으면 null이고 화면에서 그 줄이 사라진다.
 * @param minOrder 최소주문금액. 적어두면 이 배너가 오퍼로 설 때 조건으로
 *                 함께 들어간다. 안 적으면 {@code extra}에서 도로 뽑는다
 *                 ({@link #effectiveMinOrder()}) — 사람이 둘 다 적는 일이 거의
 *                 없어서 이 칸만 비운 배너가 계속 나왔다.
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
        @JsonProperty("notify") Boolean notifyFlag,
        Boolean notifyImmediately,
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
        Boolean untilSoldOut) {

    static final int DEFAULT_PRIORITY = 999;

    /** 배달앱 밖, 브랜드 자체 앱이나 사이트의 행사. 앱 배지 없이 그리고 오퍼 비교에서 뺀다. */
    public static final String OWN = "own";

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
                .targeted(targeted).firstCome(firstCome).untilSoldOut(untilSoldOut);
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

        public Banner build() {
            return new Banner(id, brand, platform, url, amount, period, extra, minOrder, color,
                    startsAt, endsAt, soldOut, soldOutOn, priority, brands, spec,
                    notify, notifyImmediately, brandLabels,
                    group, via, amountSpec, targeted, firstCome, untilSoldOut);
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

    /**
     * {@code extra}의 "18,900원↑" / "18,900원 이상"에서 앞 숫자.
     *
     * <p>맨 앞 금액만 본다. "25,000원↑, 고정 6,000+선착순 4,000"처럼 뒤에
     * 다른 금액이 따라붙는 문구가 흔하다 — 그것까지 잡으면 할인액을
     * 최소주문금액으로 읽는다.
     *
     * <p>"원"은 있어도 되고 없어도 된다. 사람이 손으로 적는 칸이라 "16,000↑"
     * 처럼 빼고 쓰는 일이 실제로 있었고(2026-08-29 처갓집), 그때 조건이
     * 화면에서 "최소주문 미확인"으로 떴다. 화살표나 "이상"이 뒤따르는 것이
     * 최소주문금액이라는 신호지 "원"이 아니다.
     */
    private static final Pattern EXTRA_MIN_ORDER = Pattern.compile(
            // 맨 앞의 "18,900원↑" / "18,900원 이상" / "16,000↑"
            "^\\s*([0-9][0-9,]*)\\s*(?:원)?\\s*(?:↑|이상)"
            // 또는 어디에 있든 "최소주문 20,000원" — 말로 밝힌 경우
            + "|최소주문\\s*([0-9][0-9,]*)\\s*원?");

    /**
     * 오퍼 조건으로 쓸 최소주문금액. 명시로 적은 값이 먼저다.
     *
     * <p>배너를 올리는 사람은 {@code extra}에 "16,000원↑"를 적고 끝낸다.
     * 실측(2026-08-25)으로 살아 있는 배너 셋 전부가 extra에는 금액을
     * 적고 minOrder는 비워 두어, 카드에 선 오퍼가 전부 "최소주문 미확인"
     * 이었다. 그 문장을 몸도 읽게 해서 손으로 두 번 적는 일을 없앱니다.
     *
     * <p><b>{@code effectiveMinOrder}/{@code minOrderFromExtra}/{@code compoundMinOrders}/
     * {@link #compoundTiers()}/{@link #brandAmounts()}는 옛 모양 전용이다(RULES 11,
     * Task 19).</b> 전부 {@code extra} 문장을 정규식으로 되짚거나 {@code spec.items()}
     * (BannerSpec의 옛 칸)를 읽는다 - 지울 수 있는 조건은 라이브 파일에 그 모양이 없을
     * 때다. Task 19에서 {@code main} 트리를 찾아본 결과 이 다섯 메서드를 부르는 곳이
     * {@code BannerTextTest}/{@code BannerCatalogTest} 말고 없었다 - {@code BrandComparisonService}가
     * "아직 읽는다"(RULES 1)는 근거를 다시 확인 못 했다. 그래도 RULES 1이 명시적으로
     * "손대면 안 된다"고 못 박았으니 지우지 않고 둔다 - 리플렉션이나 향후 호출부
     * 가능성까지 이 파일만 보고 배제할 수 없다.
     */
    public Integer effectiveMinOrder() {
        Integer fromText = minOrderFromExtra();
        return fromText != null ? fromText : minOrder;
    }

    private Integer minOrderFromExtra() {
        if (extra == null) return null;
        Matcher m = EXTRA_MIN_ORDER.matcher(extra);
        if (!m.find()) return null;
        String digits = m.group(1) != null ? m.group(1) : m.group(2);
        try {
            return Integer.valueOf(digits.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    // EXTRA_MIN_ORDER와 같은 모양이지만 문장 맨 앞으로 안 묶는다 — 겹쳐
    // 쓴 문구는 두 번째 문턱이 맨 앞이 아니라("18,000원↑ ... + 25,000원↑
    // ...") ^ 앵커가 걸린 EXTRA_MIN_ORDER로는 안 잡힌다.
    private static final Pattern MIN_ORDER_ANYWHERE = Pattern.compile(
            "([0-9][0-9,]*)\\s*(?:원)?\\s*(?:↑|이상)|최소주문\\s*([0-9][0-9,]*)\\s*원?");

    /**
     * 겹쳐 쓴 쿠폰 둘의 최소주문금액을 각자 것으로 가른다.
     *
     * <p>"18,000원↑ 즉시 3,000원 + 25,000원↑ 선착순 5,000원"처럼 "+"로
     * 나뉜 두 조각에 문턱이 하나씩 딸려 있다. 조각별로 따로 찾는다 —
     * 하나로 뭉쳐 더 비싼 쪽을 양쪽에 다 씌우면, 3,000원 쪽도 실제보다
     * 높은 문턱(25,000원)에서만 되는 것처럼 보인다(2026-09-03, 사용자
     * 지적: 네네치킨 요기요 실측 — 3,000원은 18,000원↑, 5,000원은
     * 25,000원↑로 서로 다르다).
     *
     * <p>뒤 조각에 문턱이 안 적혀 있으면(예: "고정 6,000+선착순 10%") 앞
     * 조각 것을 그대로 물려받는다 — 보통 한 쿠폰의 조건 안에서 갈라 쓴
     * 문구라 같은 문턱을 공유하는 경우다.
     */
    private Integer[] compoundMinOrders() {
        Integer fallback = effectiveMinOrder();
        if (extra == null) return new Integer[] {fallback, fallback};
        String[] parts = extra.split("\\+", 2);
        Integer first = minOrderIn(parts[0]);
        Integer second = parts.length > 1 ? minOrderIn(parts[1]) : null;
        if (first == null) first = fallback;
        if (second == null) second = first;
        return new Integer[] {first, second};
    }

    private static Integer minOrderIn(String text) {
        Matcher m = MIN_ORDER_ANYWHERE.matcher(text);
        if (!m.find()) return null;
        return digits(m.group(1) != null ? m.group(1) : m.group(2));
    }

    /** "18,000원↑" / "18,000원 이상 주문 시" — 통째로 지울 토큰. */
    private static final Pattern MIN_ORDER_TOKEN = Pattern.compile(
            "[0-9][0-9,]*\\s*원?\\s*(?:↑|이상(?:\\s*주문\\s*시)?)");

    /**
     * 화면에 보여줄 조건 문구 — extra에서 최소주문금액 언급만 뺀다.
     *
     * <p>그 숫자는 이미 tiers의 minOrder로 따로 뜬다("18,000↑" 배지,
     * App.jsx). extra 원문을 그대로 conditions에 실으면 같은 문턱이
     * 두 번 보인다(2026-09-03, 사용자 지적: 네네치킨 요기요 실측 —
     * "18,000원↑ 즉시 3,000원 + 25,000원↑ 매일 16시 선착순 5,000원"이
     * 문장으로도, 그 위 티어 줄로도 뜬다).
     *
     * <p>extra 원문 자체는 안 건드린다 — compoundMinOrders() 등 금액
     * 계산이 그 문구를 그대로 읽어야 한다. 이 메서드는 화면 표시용
     * 파생값만 만든다.
     */
    public String displayConditions() {
        if (extra == null) return null;
        String stripped = MIN_ORDER_TOKEN.matcher(extra).replaceAll("");
        // 토큰이 빠지면 그 자리 구두점이 덜렁 남는다 — "16,000↑, 선착순
        // 할인"에서 앞부분을 지우면 ", 선착순 할인"이 된다(2026-09-03
        // 실측: 처갓집양념치킨 배민). 앞뒤 구두점과 겹친 공백을 정리한다.
        stripped = stripped.replaceAll("\\s{2,}", " ")
                // 슬래시도 구두점이다. "16,900원↑ / 쿠팡와우 전용"에서 앞을 지우면
                // "/ 쿠팡와우 전용"이 남았다(2026-09-24 실측, 반올림피자).
                .replaceAll("^[\\s,·+/]+|[\\s,·+/]+$", "")
                .replaceAll(",\\s*,", ",")
                .replaceAll("\\+\\s*\\+", "+")
                .trim();
        return stripped.isEmpty() ? null : stripped;
    }

    /**
     * {@code amount}의 "n,nnn원". 정액이 아니면 null.
     *
     * <p>"8,000/5,000/6,000원"처럼 시간대·가게별 금액을 슬래시로 나열한
     * 배너가 있다(쿠팡이츠 선착순, 배민 60계치킨). {@code 원}이 맨 뒤에만
     * 붙어 "n원"만 찾으면 마지막 값이 대표가 된다 — 2026-09-14 실측 7건이
     * 그렇게 뒤 값으로 서 있었다. 나열을 통째로 잡아 맨 앞 값을 쓴다.
     */
    // "7/6/6/5천원"처럼 천 단위로 줄여 적은 묶음도 읽는다(2026-09-21: 선착순 묶음 배너의 브랜드 오퍼가
    // 하나도 안 섰다 — banner_routine.group_first_come이 이 꼴로 적는다). group(2)가 "천"이면 ×1000.
    private static final Pattern HEADLINE =
            Pattern.compile("([0-9][0-9,]*(?:\\s*/\\s*[0-9][0-9,]*)*)\\s*(천)?원");

    /**
     * "4,000+10%" — 정액 뒤에 정률이 붙는다.
     *
     * <p>두 자리에 다 나온다. amount의 괄호 안("6,500원(4,000+10%)")이기도
     * 하고 extra의 문장 안("고정 6,000+선착순 10%")이기도 하다. 사이의
     * 말("선착순 ")은 배너마다 달라 길이로만 제한한다.
     */
    private static final Pattern FIXED_PLUS_RATE =
            Pattern.compile("([0-9][0-9,]*)\\s*원?\\s*\\+\\s*\\D{0,6}?([0-9]{1,3})\\s*%");

    /** "고정 6,000+선착순 4,000" — 정액 두 장을 겹쳐 쓴다. */
    private static final Pattern FIXED_PLUS_FIXED =
            Pattern.compile("([0-9][0-9,]*)\\s*원?\\s*\\+\\s*\\D{0,6}?([0-9][0-9,]*)(?!\\s*%)");

    /**
     * 복합쿠폰을 구간으로 푸는다. 아니면 빈 목록.
     *
     * <p>요기요 배너는 한 칸에 쿠폰 두 장을 적어 보낸다 — 굽네치킨
     * "6,500원(4,000+10%)", 파파존스 "고정 6,000+선착순 10%". 대표값 하나로만
     * 둔 채 카드에 세우면, 선착순가 끝나 고정분만 남았을 때 사람이
     * 그걸 알 길이 없다.
     *
     * <p><b>정률분은 최소주문금액에서 계산해 amount에 넣는다.</b>
     * {@code DiscountLadder}가 amount만 더하고 percent를 다시 계산하지 않기
     * 때문이다("각 구간의 amount는 이미 그 문턱에서 실제 받는 금액").
     *
     * <p>대표값이 문턱에서의 합보다 크면 그건 상한이다 — 파파존스
     * 실측(2026-08-25)에서 "최대 10,000원"은 고정 6,000 + 정률 상한 4,000이었고,
     * 25,000원에서 실제 받는 것은 6,000 + 2,500 = 8,500이다. 상한을
     * {@code cap}으로 남기고 사다리는 보장되는 값을 낸다.
     *
     * <p>대표값이 합보다 작으면 문구를 잘못 읽은 것이다 — 지어내지 않고
     * 빈 목록을 돌려 대표값 하나로 둔다.
     */
    public List<com.discounttracker.offer.DiscountTier> compoundTiers() {
        Integer headline = headlineAmount();
        Integer min = effectiveMinOrder();
        if (headline == null || min == null) return List.of();

        Matcher rate = firstMatch(FIXED_PLUS_RATE);
        if (rate != null) {
            Integer fixed = digits(rate.group(1));
            Integer percent = digits(rate.group(2));
            if (fixed == null || percent == null || percent == 0) return List.of();
            int rated = min * percent / 100;
            if (headline < fixed + rated) return List.of();
            // 대표값이 더 크면 그 초과분이 정률의 상한이다. 같으면
            // 상한을 알 길이 없으니 붙이지 않는다.
            Integer cap = headline > fixed + rated ? headline - fixed : null;
            return List.of(
                    new com.discounttracker.offer.DiscountTier(min, fixed, null, null, null, null, null),
                    new com.discounttracker.offer.DiscountTier(min, rated, percent, cap, null, null, null));
        }

        Matcher two = firstMatch(FIXED_PLUS_FIXED);
        if (two != null) {
            Integer a = digits(two.group(1));
            Integer b = digits(two.group(2));
            if (a == null || b == null) return List.of();
            if (a + b != headline) return List.of();
            // 두 쿠폰의 문턱이 다를 수 있다 — 하나로 뭉치지 않고 조각별로
            // 가른다(compoundMinOrders).
            Integer[] mins = compoundMinOrders();
            return List.of(
                    new com.discounttracker.offer.DiscountTier(mins[0], a, null, null, null, null, null),
                    new com.discounttracker.offer.DiscountTier(mins[1], b, null, null, null, null, null));
        }
        return List.of();
    }

    /** amount를 먼저 보고 extra를 본다. 둘 다 쓰이는 자리다. */
    private Matcher firstMatch(Pattern pattern) {
        for (String text : new String[] {amount, extra}) {
            if (text == null) continue;
            Matcher m = pattern.matcher(text);
            if (m.find()) return m;
        }
        return null;
    }

    /** 대표 정액. "최대 30%"처럼 정액이 아니면 null. 배너를 오퍼로 세울 때도 이 값이다. */
    public Integer headlineAmount() {
        if (amount == null) return null;
        Matcher m = HEADLINE.matcher(amount);
        if (!m.find()) return null;
        // 나열이면 맨 앞 값이 대표다 — 사람이 그 순서로 적었다.
        return scaled(digits(m.group(1).split("/")[0].trim()), m.group(2));
    }

    /**
     * 배너가 말하는 (브랜드, 금액) 쌍 전부. 오퍼는 브랜드마다 하나씩 선다(2026-09-19: 노모어·푸라닭
     * 묶음 배너에서 푸라닭 오퍼가 안 떴다).
     *
     * <ul>
     *   <li>구조 필드 {@code items}가 있으면 그것이다.</li>
     *   <li>{@code brands}가 여럿이고 금액이 같은 개수로 나열("최대 10,000/8,000원")이면 순서대로 짝짓는다.</li>
     *   <li>아니면 대표 브랜드에 대표 금액 하나.</li>
     * </ul>
     */
    public List<java.util.Map.Entry<String, Integer>> brandAmounts() {
        List<java.util.Map.Entry<String, Integer>> out = new java.util.ArrayList<>();
        if (spec != null && spec.items() != null && !spec.items().isEmpty()) {
            for (BannerSpec.BannerItem it : spec.items()) {
                if (it.brand() != null && it.amount() != null) out.add(java.util.Map.entry(it.brand(), it.amount()));
            }
            if (!out.isEmpty()) return out;
        }
        if (brands != null && brands.size() > 1 && amount != null) {
            Matcher m = HEADLINE.matcher(amount);
            if (m.find()) {
                String[] parts = m.group(1).split("/");
                if (parts.length == brands.size()) {
                    for (int i = 0; i < parts.length; i++) {
                        Integer v = scaled(digits(parts[i].trim()), m.group(2));
                        if (brands.get(i) != null && v != null) out.add(java.util.Map.entry(brands.get(i), v));
                    }
                    if (out.size() == parts.length) return out;
                    out.clear();
                }
            }
        }
        Integer head = headlineAmount();
        if (brand != null && head != null) out.add(java.util.Map.entry(brand, head));
        return out;
    }

    private static Integer scaled(Integer v, String unit) {
        return v == null || unit == null ? v : v * 1000;
    }

    private static Integer digits(String raw) {
        try {
            return Integer.valueOf(raw.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * {@code startsOn() <= day <= endsOn()}. 경계일 자신도 포함이다.
     *
     * <p>Task 19 조정: {@code BannerCatalog}가 아직 이 이름으로 부른다 - 시각으로
     * 옮긴 뒤에도 지우지 않고 파생 접근자로 다시 짠다. {@link #activeAt}로
     * 바꾸는 일은 그 호출부를 고치는 Task 6이 한다.
     */
    boolean activeOn(LocalDate day) {
        return !day.isBefore(startsOn()) && !day.isAfter(endsOn());
    }
}
