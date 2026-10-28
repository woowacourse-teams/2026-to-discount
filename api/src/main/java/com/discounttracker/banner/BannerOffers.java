package com.discounttracker.banner;

import com.discounttracker.offer.Certainty;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferRecord;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 오늘 띄우는 배너를 원장 레코드 모양으로 바꾼다. 비교 서비스가 이것을 원장 앞에 붙여 같은 길(별칭 묶기,
 * 같은 앱 중복 정리, 만료 판정, 정렬)로 태운다 - 배너용 길을 따로 내면 그쪽이 먼저 낡는다.
 *
 * <p>2026-10-14 {@code BrandComparisonService}에서 떼어 냈다. 그 클래스가 배너 해석(약 220줄)과
 * 브랜드 비교를 같이 들고 있어 한쪽을 고치려면 다른 쪽까지 읽어야 했다.
 *
 * <p>브랜드가 없는 배너(앱 전체 행사)와 금액 칸({@code amount:} 덩이)이 없는 배너는 붙을 값이 없어서 뺀다.
 * 문장만 적은 옛 모양을 세우던 길은 2026-10-15에 지웠다(운영 파일 0장). 자사 배너는 2026-09-22부터
 * 넣는다 - 브랜드 자체 앱이나 사이트의 행사도 그 브랜드를 보는 사람에게는 고를 수 있는 값이다.
 *
 * <p>정률 배너는 대표 정액(headline)이 없다 - 그래도 카드에는 선다. 다만 최고 할인 비교에는 못 들어간다
 * (액수 자체가 없어서). 묶음은 접지 않는다. 브랜드마다 오퍼가 하나씩 선다.
 */
public final class BannerOffers {

    private BannerOffers() {
    }

    /** @param activeMembers {@link BannerCatalog#activeMembers()} - 오늘 띄우는 배너, 묶음은 구성원마다 한 장 */
    public static List<OfferRecord> of(List<Banner> activeMembers, Clock clock) {
        // capturedAt은 날짜가 아니라 시각까지 있어야 한다. Offer.preferredOver가
        // 문자열로 그냥 비교하는데("2026-09-03" vs "2026-09-03T12:00:00+09:00"),
        // 날짜만 넣으면 같은 날 찍힌 원장 레코드보다 "더 이르다"고 읽혀
        // 배너가 항상 진다 — 오늘 등록한 배너가 어제 원장 값에 안 이겨서
        // 카드에 안 뜨는 사고가 났다(사용자 확인, 2026-09-03).
        // 지금 시각 대신 오늘 23:59:59로 고정한다. 같은 날 원장 기록보다 늘 늦어 배너가 이기는 것은 같고,
        // 값이 요청마다 바뀌지 않아 응답 ETag가 하루 동안 같다(지금 시각이면 매 요청 ETag가 달라 304가
        // 한 번도 안 났다, 2026-10-14). 웹은 이 값을 최신순 정렬에만 쓴다.
        String today = LocalDate.now(clock).atTime(23, 59, 59)
                .atZone(clock.getZone()).toOffsetDateTime().toString();
        List<OfferRecord> records = new ArrayList<>();
        for (Banner banner : activeMembers) {
            if (banner.brand() == null) continue;
            BannerAmount amountSpec = banner.amountSpec();
            // 1+1, 2+1 묶음 행사는 원문("징거버거 1+1")으로 서고 금액 칸은 정렬값(BUNDLE_SORT_VALUE)이다. kind가 bundle이라 할인액
            // 비교(OfferComparison)에는 안 들고, 웹이 카드 오퍼 맨 위에 둔다(2026-10-11 사용자).
            if (amountSpec != null && amountSpec.isBundle()) {
                records.add(common(banner, banner.brand(), today)
                        .amount(BannerAmount.BUNDLE_SORT_VALUE)
                        .offerType(Offer.BANNER_OFFER_TYPE)
                        .rawText(amountSpec.bundleText())
                        .minOrderAmount(banner.minOrder())
                        .conditions(BannerText.conditions(banner))
                        .kind(amountSpec.kind().key())
                        .build());
                continue;
            }
            if (amountSpec == null || (amountSpec.headline() == null && amountSpec.percent() == null)) continue;
            // 정률 배너는 배달앱에서는 오퍼로 안 선다(2026-09-22 되돌림). headline()이 없어
            // amount null인 채로 서면 "금액 미확인" 칩이 뜨고, 그걸 가리려 배지에 퍼센트를
            // 적으면 App.jsx의 status-badge 한 자리를 차지해 기간·시각 배지가 사라진다
            // (2026-09-21 고정을 되돌리는 셈이었다). 배달앱 정률 배너는 원래(Task 8 이전)
            // 오퍼로 안 섰으니 그대로 두는 편이 무회귀다. own은 예외로 그대로 세운다 -
            // brief의 ownBannerNowStandsAsAnOffer(50% 캐시백)가 이 값을 요구한다. 정률을
            // 제대로 그리는 일(App.jsx가 별도 자리를 만드는 일)은 Task 17·18이 한다.
            if (amountSpec.percent() != null && !Banner.OWN.equals(banner.platform())) continue;
            records.add(common(banner, banner.brand(), today)
                    .amount(amountSpec.headline())
                    // 표식은 칸에서 나온다. 타겟딜은 계정에 따라 갈리므로 상한과 같은 성질이다.
                    .qualifier(qualifierOf(banner))
                    .offerType(offerType(banner))
                    .rawText(banner.amount())
                    .minOrderAmount(banner.minOrder())
                    .conditions(BannerText.conditions(banner))
                    // 무엇을 주는가 - own 배너의 캐시백/적립까지 discount로 뭉개면 확정
                    // 할인처럼 최고 할인 후보에 낄 수 있다(2026-09-22 fix round).
                    .kind(amountSpec.kind().key())
                    .build());
        }
        return records;
    }

    /**
     * 배너 오퍼가 같이 채우는 칸.
     *
     * <p>{@code section} 자리는 원장에서는 화면 섹션 제목 그대로다(ADR-006). 배너 레코드에는 그 개념이 없고
     * tracker가 offerType="banner"인 행을 낼 일도 없어 두 뜻이 안 섞인다 - 여기서는 배너 id만 싣는다(확실성
     * 경고 로그가 브랜드·플랫폼만으로 못 찾는 배너를 이걸로 찾는다).
     *
     * <p>처음 본 시각은 배너가 걸린 시각이다. null이면 웹이 신규로 못 잡았다(2026-10-09: 홍콩반점, KFC 등 배너
     * 오퍼가 그날 시작인데 신규 탭에 안 떴다). 어제와 같은 행사로 기간을 늘린 배너는 startsAt이 그대로라 첫날만 신규다.
     */
    private static OfferRecord.Builder common(Banner banner, String brand, String today) {
        // qualifiers(구조화 조건)는 배너에 없는 칸이라 설정하지 않는다(null, #155).
        return OfferRecord.builder(banner.platform(), brand)
                .section(banner.id())
                .capturedAt(today)
                .expiresAt(banner.endsOn().toString())
                .badge(banner.period())
                .link(banner.url())
                .membership(banner.spec() == null ? null : banner.spec().membership())
                .soldOut(banner.soldOut())
                .firstSeenAt(banner.startsAt() == null ? null : banner.startsAt() + "+09:00");
    }

    private static String offerType(Banner banner) {
        return banner.firstCome() != null ? Offer.BANNER_FIRST_COME_OFFER_TYPE : Offer.BANNER_OFFER_TYPE;
    }

    /**
     * 이행 기간에만 남는 다리. 원장 표기를 배너 칸에서 만든다.
     *
     * <p>{@code OfferRecord}가 아직 {@code qualifier}만 들고 있어서, 배너 칸에서 정한
     * 확실성을 원장 표기로 한 번 돌려 적는다({@link Certainty#fromQualifier}가 되짚는다).
     */
    private static String qualifierOf(Banner banner) {
        Certainty c = banner.isTargeted() ? Certainty.CAPPED : banner.amountSpec().certainty();
        return switch (c) {
            case CAPPED -> "최대";
            case PERCENT -> "정률";
            case RANDOM -> "랜덤";
            // MENU_ONLY는 여기 안 나온다 - BannerAmount.certainty()가 낼 수 있는 값이
            // EXACT/CAPPED/RANDOM/PERCENT뿐이다(특정 메뉴 한정은 원장 qualifier
            // "특정메뉴"에서만 나온다). default 대신 이름을 적어 둔다 - Certainty에
            // 여섯째 값이 생기면 이 스위치가 조용히 새지 말고 컴파일이 깨져야 한다.
            case MENU_ONLY, EXACT -> null;
        };
    }
}
