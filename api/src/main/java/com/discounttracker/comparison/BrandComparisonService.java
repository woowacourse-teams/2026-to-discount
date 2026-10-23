package com.discounttracker.comparison;

import com.discounttracker.analytics.PopularityIndex;
import com.discounttracker.banner.BannerCatalog;
import com.discounttracker.banner.BannerOffers;
import com.discounttracker.brand.BrandCatalog;
import com.discounttracker.history.HistoryRepository;
import com.discounttracker.history.OfferHistory;
import com.discounttracker.offer.Certainty;
import com.discounttracker.offer.FirstComeLinkFilter;
import com.discounttracker.offer.Offer;
import com.discounttracker.offer.OfferComparison;
import com.discounttracker.offer.OfferRecord;
import com.discounttracker.offer.OfferRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * 원장의 낱개 레코드를 브랜드 단위 비교 결과로 묶는다.
 *
 * <p>하는 일은 네 가지뿐이다: 종료일이 지난 오퍼 걸러내기, 별칭으로 같은
 * 브랜드 묶기, 같은 앱에 중복 잡힌 오퍼 정리하기, 할인 큰 순으로 줄
 * 세우기. 판정 규칙 자체는 {@link OfferRecord}·{@link Offer}와
 * {@link BrandComparison}이 들고 있다.
 */
@Service
public class BrandComparisonService {

    private static final Logger log = LoggerFactory.getLogger(BrandComparisonService.class);

    // 이미 알린 어긋남. compare()는 요청마다 돌아 같은 경고가 하루 수백 번 찍혔다(2026-09-30).
    // ponytail: 배너 id가 날마다 바뀌어 조금씩 쌓인다. 재기동 때 비워지고 하루 수십 건이라 둔다.
    private final Set<String> warnedCertainty = ConcurrentHashMap.newKeySet();

    private final OfferRepository offers;
    private final BrandCatalog brands;
    private final BannerCatalog banners;
    private final Clock clock;
    private final HistoryRepository history;
    /** 인기 점수(2026-09-19). 테스트처럼 없으면 전부 0. */
    private final PopularityIndex popularity;
    /** 브랜드 링크 없이는 그 브랜드에 못 가는 앱 — 링크 없는 오퍼는 숨긴다(application.yml
     * discount.hide-unlinked-platforms, 기본 yogiyo). 테스트의 4인자 생성자는 비어 있다. */
    private final Set<String> unlinkedHidden;

    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock) {
        this(offers, brands, banners, clock, null, "", HistoryRepository.of(OfferHistory.empty()));
    }

    /** 테스트용: 이력을 넣는다. */
    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock, HistoryRepository history) {
        this(offers, brands, banners, clock, null, "", history);
    }

    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock, String hideUnlinkedPlatforms) {
        this(offers, brands, banners, clock, null, hideUnlinkedPlatforms, HistoryRepository.of(OfferHistory.empty()));
    }

    @Autowired
    public BrandComparisonService(OfferRepository offers, BrandCatalog brands,
                                  BannerCatalog banners, Clock clock,
                                  PopularityIndex popularity,
                                  @Value("${discount.hide-unlinked-platforms:yogiyo}")
                                  String hideUnlinkedPlatforms,
                                  HistoryRepository history) {
        this.history = history;
        this.offers = offers;
        this.brands = brands;
        this.banners = banners;
        this.clock = clock;
        this.popularity = popularity;
        this.unlinkedHidden = Arrays.stream((hideUnlinkedPlatforms == null ? "" : hideUnlinkedPlatforms).split(","))
                .map(String::trim).filter(x -> !x.isEmpty()).collect(Collectors.toSet());
    }

    public List<BrandComparison> compare() {
        // 배너는 사람이 그날 손으로 적는 행사다. 원장(캡처)에는 안 잡히지만
        // 실제로 받을 수 있는 할인이라, 배너에 올린 순간 그 브랜드 카드에도
        // 뜨고 기간이 지나면 알아서 빠져야 한다.
        //
        // 레코드로 바꿔 원장 앞에 붙이면 그 뒤 처리(별칭 묶기, 같은 앱 중복
        // 정리, 만료 판정, 정렬)를 전부 그대로 탄다 — 배너용 경로를 따로
        // 내면 그쪽이 먼저 낡는다.
        List<OfferRecord> withBanners = new ArrayList<>(BannerOffers.of(banners.activeMembers(), clock));
        withBanners.addAll(offers.findAll());
        return compare(withBanners);
    }

    /** 같은 앱의 선착순 칸과 상시 칸을(확실성이 같다) 한 칸으로 합친다. */
    private static void mergeSameFirstCome(Map<String, Offer> offersBySlot) {
        for (String slot : List.copyOf(offersBySlot.keySet())) {
            if (!slot.endsWith("#first-come")) continue;
            String platform = slot.substring(0, slot.length() - "#first-come".length());
            Offer first = offersBySlot.get(slot);
            Offer standing = offersBySlot.get(platform);
            // 확실성이 다르면(랜덤·상한 대 확정) 금액으로 견줄 수 없어 둘 다 둔다.
            if (standing == null || first.certainty() != standing.certainty()) continue;
            // 금액이 다르면 선착순을 상시의 한 구간으로 붙인다(2026-10-15 사용자, Offer#withFirstComeTier).
            // 2026-09-30 청년피자 쿠팡이츠 선착순 10,000원과 상시 7,000원이 두 오퍼로 떴고, 그 뒤 큰 쪽만
            // 세웠더니 선착순이 소진된 줄 모르는 사이 상시를 가렸다.
            Offer merged = java.util.Objects.equals(first.amount(), standing.amount()) ? null
                    : standing.withFirstComeTier(first);
            if (merged == null) {
                // 금액이 같으면 같은 쿠폰이다(2026-09-30 던킨 땡겨요). 붙일 수 없을 때도 예전처럼 하나만 둔다.
                // 선착순이 소진됐으면 상시가 선다 - 2026-09-30 맘스터치처럼 상시 할인이 카드에서 사라지면 안 된다.
                int a = first.amount() == null ? 0 : first.amount();
                int b = standing.amount() == null ? 0 : standing.amount();
                merged = !first.soldOut() && a >= b ? first : standing;   // 같으면 선착순(배너)이 먼저
            }
            offersBySlot.put(platform, merged);
            offersBySlot.remove(slot);
        }
    }


    /** 넘겨받은 레코드로 비교한다. 운영 경로는 원장 레코드로 {@link #compare()}가 부른다. */
    List<BrandComparison> compare(List<OfferRecord> records) {
        // 원장은 tracker가 push할 때만 바뀌지만 오늘 날짜는 계속 바뀐다.
        // 그래서 만료 판정은 적재 시점이 아니라 요청을 처리하는 지금 한다.
        LocalDate today = LocalDate.now(clock);

        // 삽입 순서를 유지해야 같은 입력에 항상 같은 순서가 나온다(동점일 때).
        Map<String, Map<String, Offer>> byBrand = new LinkedHashMap<>();
        Map<String, Integer> maxConfirmed = new LinkedHashMap<>();
        Map<String, Integer> maxHeld = new LinkedHashMap<>();
        // 확실성 어긋남 경고에 배너 id를 실으려고 슬롯마다 마지막으로 본 배너 id를
        // 따로 든다. Offer는 출처(fromBanner)만 알고 자기가 어느 배너였는지는 모른다.
        Map<String, Map<String, String>> bannerIdBySlot = new LinkedHashMap<>();

        for (OfferRecord record : records) {
            // 묶기·중복정리·대표금액 계산 어디에도 넣지 않는다. 정리한 뒤에
            // 빼면 만료된 오퍼가 승자로 뽑힌 다음 사라지면서, 같은 앱에서
            // 진 살아 있는 오퍼까지 함께 없앤다(ADR-008).
            if (record.isExpired(today)) {
                continue;
            }

            String name = brands.canonical(record.brand());
            // 요기요는 브랜드 링크(brands.yml links.yogiyo)가 없으면 칩을 눌러도 앱만 켜지고 그 브랜드로
            // 못 간다(2026-09-21 토핑몬스터피자). 그런 오퍼는 화면에 안 낸다 — 배너 유래(자기 링크)는 예외.
            if (unlinkedHidden.contains(record.platform()) && record.link() == null
                    && brands.find(name).links().get(record.platform()) == null) {
                continue;
            }
            Offer offer = Offer.from(record, today);

            // 앱마다 오퍼 하나가 대표다. 다만 뽑기 오퍼(랜덤)는 확정 오퍼와 **다른 자리**에 둔다 —
            // 같은 자리에 두면 확정액이 이겨 상한이 사라진다(2026-09-20 노모어·푸라닭). 원장
            // 쪽(store.offer_key)과 같은 규칙.
            // 선착순 배너도 따로 된 칸이다. 같은 브랜드의 상시 할인(원장)과 다른 쿠폰인데 한 칸에
            // 두면 배너가 이겨 그날 상시 할인이 카드에서 사라졌고, 요청마다 확실성 경고가 찍혔다
            // (2026-09-30 맘스터치: 상시 3,000원 대신 선착순 최대 5,000원만). 웹 offerKey와 같은 규칙.
            String slot = offer.firstCome() ? record.platform() + "#first-come"
                    : offer.certainty() == Certainty.RANDOM ? record.platform() + "#random" : record.platform();
            Map<String, Offer> offersOnPlatform = byBrand.computeIfAbsent(name, k -> new LinkedHashMap<>());

            // 배너와 원장이 같은 (브랜드, 앱)을 서로 다른 확실성으로 볼 수 있다 — 사람이
            // 배너에 "최대"라 적었는데 원장은 확정으로 캡처했거나 그 반대다. 조용히
            // 하나를 택해 버리면 그 어긋남이 아무도 모르게 묻힌다.
            Offer existing = offersOnPlatform.get(slot);
            Map<String, String> bannerIdsHere = bannerIdBySlot.computeIfAbsent(name, k -> new LinkedHashMap<>());
            if (existing != null && existing.fromBanner() != offer.fromBanner()
                    && existing.certainty() != offer.certainty()
                && warnedCertainty.add(bannerIdsHere.get(slot) + "|" + name + "|" + record.platform()
                        + "|" + existing.certainty() + "|" + offer.certainty())) {
                // 배너 레코드가 항상 원장보다 먼저 처리된다(compare()가 BannerOffers.of()를
                // 원장 앞에 붙인다) - 그래서 어긋남이 걸리는 시점엔 existing이 배너, offer가
                // 원장이다. offer가 배너인 경우는 실제 경로에서 안 나온다(2-인자 compare에
                // 순서를 뒤집어 넘기는 테스트가 아니면). 브랜드 하나에 배너가 여러 장일 수
                // 있어 브랜드·플랫폼만으로는 어느 배너인지 못 찾는다 - id를 같이 남긴다.
                log.warn("배너와 원장의 확실성이 다르다 - 배너={}, 브랜드={}, 플랫폼={}, 배너 확실성={}, 원장 확실성={}",
                        bannerIdsHere.get(slot), name, record.platform(),
                        existing.certainty(), offer.certainty());
            }
            if (offer.fromBanner()) {
                bannerIdsHere.put(slot, record.section());
            }
            offersOnPlatform.merge(slot, offer, Offer::preferredOver);

            // 원장의 금액이 아니라 오늘 기준 금액을 쓴다 — 만료된 구간 때문에
            // 대표값이 내려갔으면 카드 대표 금액과 정렬도 같이 내려가야 한다.
            //
            // 오퍼가 정렬에 기여하는 금액은 확실성에 따라 다르다
            // ({@link OfferComparison#comparisonAmount}). 프론트의 filters.js가 같은
            // 판정표(src/test/resources/contracts/certainty-cases.json)를 읽어 어긋남을 막는다(ADR-016).
            //
            // own(자사)과 비할인(캐시백·포인트), 품절 오퍼는 maxConfirmed·maxHeld
            // 어느 쪽도 못 채운다 — 배달앱끼리 겨루는 값이 아니라 어느 쪽 천장도 그
            // 값으로 정할 수 없다(2026-09-22 fix round 2: 자사 확정액이 "최고 할인"으로
            // 새던 자리, 배달앱 캐시백까지 확정 할인으로 셌던 구멍; 2026-09-23 fix round 3:
            // 품절도 같은 문). 규칙은 {@link OfferComparison#comparisonAmount} 한 곳에만
            // 적는다 — 호출 한 번으로 maxConfirmed·maxHeld 둘 다 같은 값을 쓴다, 나눠
            // 물으면 한쪽만 고쳐도 안 터진다.
            //
            // 보류(maxHeld) 쪽은 "최대"(CAPPED)도 금액을 낸다 - 확정 오퍼가 없는
            // 브랜드끼리만 줄 세우는 값이라 견주는 값이 다 미확정이고, 빼면 상한
            // 보류 브랜드가 전부 0으로 묶여 흩어진다(2026-09-23 fix round 4).
            boolean confirmed = record.status().isConfirmed();
            Integer forSorting = OfferComparison.comparisonAmount(offer.certainty(), offer.kind(),
                    offer.soldOut(), record.platform(), offer.amount(), confirmed);
            if (forSorting != null) {
                Map<String, Integer> target = confirmed ? maxConfirmed : maxHeld;
                target.merge(name, forSorting, Math::max);
            }
        }

        // 선착순 배너가 원장 오퍼와 같은 쿠폰이면(금액과 확실성이 같다) 따로 세우지 않고 예전처럼
        // 한 칸으로 합친다. 2026-09-30 던킨 땡겨요: 배너와 원장이 같은 7,000원인데 두 번 떴다.
        byBrand.values().forEach(BrandComparisonService::mergeSameFirstCome);

        // 오픈 전 배민 선착순은 브랜드 페이지에 쿠폰이 없어 배짱할인 허브로 보낸다(오픈 뒤엔 원래 링크). 칸을 합친 뒤에
        // 건다: 합치면서 오픈 시각 조건이 다른 기록에서 오는 경우가 있어 합친 오퍼의 조건과 링크로 판정해야 한다.
        LocalTime now = LocalTime.now(clock);
        byBrand.values().forEach(slots -> slots.replaceAll((slot, o) -> FirstComeLinkFilter.apply(o, now)));

        // 신규 여부는 이력이 판정한다(설계 2026-10-09). 금액 없는 오퍼는 모름(null).
        OfferHistory h = history.current();
        List<BrandComparison> result = new ArrayList<>();
        byBrand.forEach((name, offersByPlatform) -> result.add(new BrandComparison(
                brands.find(name),
                maxConfirmed.get(name),
                maxHeld.get(name),
                new ArrayList<>(offersByPlatform.values().stream()
                        .map(o -> o.amount() == null ? o
                                : o.withIsNew(h.novelty(o.platform(), name, o.amount(), today).asBoolean()))
                        .toList()),
                popularity == null ? 0 : popularity.scoreOf(name),
                popularity == null ? 0 : popularity.todayOf(name),
                popularity == null ? 0 : popularity.yesterdayOf(name),
                popularity == null ? 0 : popularity.previousOf(name))));

        result.sort(BrandComparison.byBestDiscount());
        return result;
    }
}
