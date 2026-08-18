/* =========================================================
   Psycho Shop - Live Pricing Engine
   -----------------------------------------------------------
   Premium:
   - یک قیمت پایه از Fragment API / prices.json
   - همان قیمت پایه برای تک‌بوست و چهار‌بوست
   - فعلاً هیچ مبلغی کم نمی‌شود
   - بعداً فقط PREMIUM_DEDUCTION ها را تغییر می‌دهیم

   Stars:
   - 13 و 21 قیمت ثابت
   - سایر بسته‌ها از prices.json
   ========================================================= */

(function () {
    "use strict";

    console.log("pricing.js loaded");

    var PRICE_ENDPOINT = "api/prices.json";

    // قیمت‌ها هر 3 دقیقه دوباره خوانده می‌شوند
    var REFRESH_MS = 3 * 60 * 1000;

    // اگر قیمت بیشتر از 15 دقیقه قدیمی باشد، نمایش داده نمی‌شود
    var MAX_PRICE_AGE_MS = 15 * 60 * 1000;

    /* =====================================================
       PREMIUM PRICE ADJUSTMENT
       -----------------------------------------------------
       فعلاً صفر است تا قیمت خام واقعی را روی سایت ببینیم.

       بعداً مثلاً:

       single:
       "3m": 300000

       یعنی:
       قیمت تک‌بوست 3 ماهه =
       قیمت پایه - 300000

       four:
       "3m": 700000

       یعنی:
       قیمت چهاربوست 3 ماهه =
       قیمت پایه - 700000
       ===================================================== */

    var PREMIUM_DEDUCTION = {
        single: {
            "3m": 0,
            "6m": 0,
            "12m": 0
        },

        four: {
            "3m": 0,
            "6m": 0,
            "12m": 0
        }
    };

    /* =====================================================
       STARS
       ===================================================== */

    var MARGIN_STARS = 47000;

    var FIXED_STARS = {
        13: 50000,
        21: 165000
    };

    var priceData = null;
    var listeners = [];

    /* =====================================================
       ابزارها
       ===================================================== */

    function roundTo(n, step) {
        step = step || 1000;
        return Math.ceil(n / step) * step;
    }

    function toFiniteNumber(value) {
        var numeric =
            typeof value === "string"
                ? Number(value.replace(/,/g, ""))
                : Number(value);

        return Number.isFinite(numeric) && numeric > 0
            ? numeric
            : null;
    }

    function fmt(n) {
        n = Math.round(n || 0);

        return n
            .toString()
            .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    /* =====================================================
       بررسی سالم بودن prices.json
       ===================================================== */

    function isFreshPremiumPayload(data) {

        if (
            !data ||
            !data.premium ||
            !data.updatedAt ||
            !data.tonToToman
        ) {
            return false;
        }

        var updatedAt = Date.parse(data.updatedAt);

        var age = Date.now() - updatedAt;

        if (
            !Number.isFinite(updatedAt) ||
            age < -60000 ||
            age > MAX_PRICE_AGE_MS
        ) {
            return false;
        }

        if (toFiniteNumber(data.tonToToman) === null) {
            return false;
        }

        /*
         * prices.json فعلی شما ممکن است فقط premium.single
         * داشته باشد.
         *
         * بنابراین فعلاً فقط single را لازم می‌دانیم.
         * برای چهاربوست در صورت نبودن four،
         * از single استفاده می‌کنیم.
         */

        if (
            !data.premium.single ||
            !["3m", "6m", "12m"].every(function (plan) {
                return (
                    toFiniteNumber(
                        data.premium.single[plan]
                    ) !== null
                );
            })
        ) {
            return false;
        }

        return true;
    }

    /* =====================================================
       دریافت prices.json
       ===================================================== */

    function fetchPrices() {

        return fetch(
            PRICE_ENDPOINT + "?_=" + Date.now(),
            {
                cache: "no-store"
            }
        )

            .then(function (res) {

                if (!res.ok) {
                    throw new Error(
                        "HTTP " + res.status
                    );
                }

                return res.json();
            })

            .then(function (data) {

                if (!isFreshPremiumPayload(data)) {

                    throw new Error(
                        "قیمت Premium در prices.json نامعتبر یا قدیمی است"
                    );
                }

                priceData = data;

                notify();

                return data;
            })

            .catch(function (err) {

                console.warn(
                    "[pricing] قیمت آنلاین Premium در دسترس نیست:",
                    err
                );

                /*
                 * قیمت قبلی را پاک نمی‌کنیم.
                 * اگر قبلاً قیمت معتبر داشتیم،
                 * تا دریافت موفق بعدی نگه داشته می‌شود.
                 */

                notify();
            });
    }

    /* =====================================================
       Listener
       ===================================================== */

    function notify() {

        listeners.forEach(function (fn) {

            try {
                fn(priceData);
            } catch (e) {
                console.error(e);
            }

        });
    }

    /* =====================================================
       STARS
       ===================================================== */

    function starsRawToman(qty) {

        if (
            !priceData ||
            !priceData.stars
        ) {
            return null;
        }

        var tonPerStar =
            toFiniteNumber(
                priceData.stars.tonPerStar
            );

        var tonToToman =
            toFiniteNumber(
                priceData.tonToToman
            );

        if (
            tonPerStar === null ||
            tonToToman === null
        ) {
            return null;
        }

        return (
            tonPerStar *
            qty *
            tonToToman
        );
    }

    window.psychoStarsPrice = function (qty) {

        qty = parseInt(qty, 10);

        if (!qty || qty <= 0) {
            return null;
        }

        /*
         * قیمت ثابت 13 و 21
         */

        if (
            Object.prototype.hasOwnProperty.call(
                FIXED_STARS,
                qty
            )
        ) {
            return FIXED_STARS[qty];
        }

        var raw = starsRawToman(qty);

        if (raw === null) {
            return null;
        }

        return (
            roundTo(raw, 500) +
            MARGIN_STARS
        );
    };

    /* =====================================================
       PREMIUM BASE PRICE
       -----------------------------------------------------
       قیمت پایه Premium فقط از single گرفته می‌شود.

       اگر چهاربوست در prices.json وجود داشته باشد،
       باز هم فعلاً از single استفاده می‌کنیم تا قیمت پایه
       برای هر دو بخش یکسان باشد.
       ===================================================== */

    function premiumBaseToman(plan) {

        if (
            !priceData ||
            !priceData.premium ||
            !priceData.premium.single
        ) {
            return null;
        }

        var ton =
            toFiniteNumber(
                priceData.premium.single[plan]
            );

        var tonToToman =
            toFiniteNumber(
                priceData.tonToToman
            );

        if (
            ton === null ||
            tonToToman === null
        ) {
            return null;
        }

        return ton * tonToToman;
    }

    /* =====================================================
       PREMIUM FINAL PRICE
       -----------------------------------------------------
       tier:
         single = تک‌بوست
         four   = چهار‌بوست

       plan:
         3m
         6m
         12m

       فرمول:

       قیمت پایه = قیمت Fragment

       قیمت نهایی =
       قیمت پایه - مبلغ کسر مربوط به tier و plan
       ===================================================== */

    window.psychoPremiumPrice = function (
        tier,
        plan
    ) {

        var base = premiumBaseToman(plan);

        if (base === null) {
            return null;
        }

        /*
         * اگر tier ناشناخته بود، تک‌بوست در نظر گرفته می‌شود.
         */

        if (
            tier !== "single" &&
            tier !== "four"
        ) {
            tier = "single";
        }

        var deduction = 0;

        if (
            PREMIUM_DEDUCTION[tier] &&
            Object.prototype.hasOwnProperty.call(
                PREMIUM_DEDUCTION[tier],
                plan
            )
        ) {
            deduction =
                Number(
                    PREMIUM_DEDUCTION[tier][plan]
                ) || 0;
        }

        /*
         * قیمت خام را به نزدیک‌ترین 1000 تومان
         * گرد می‌کنیم.
         */

        var roundedBase =
            roundTo(base, 1000);

        /*
         * فعلاً deduction = 0
         *
         * بعداً فقط deduction را تغییر می‌دهیم.
         */

        var finalPrice =
            roundedBase - deduction;

        /*
         * اجازه نمی‌دهیم قیمت منفی یا صفر شود.
         */

        if (
            !Number.isFinite(finalPrice) ||
            finalPrice <= 0
        ) {
            return null;
        }

        return finalPrice;
    };

    /* =====================================================
       RENDER CARDS
       ===================================================== */

    function renderCards() {

        var cards =
            document.querySelectorAll(
                ".service-card[data-request='stars'][data-stars-qty]," +
                ".service-card[data-request='premium'][data-premium-tier]"
            );

        cards.forEach(function (card) {

            var price = null;

            var request =
                card.getAttribute(
                    "data-request"
                );

            if (request === "stars") {

                var qty =
                    parseInt(
                        card.getAttribute(
                            "data-stars-qty"
                        ),
                        10
                    );

                price =
                    window.psychoStarsPrice(
                        qty
                    );

            } else {

                var tier =
                    card.getAttribute(
                        "data-premium-tier"
                    );

                var plan =
                    card.getAttribute(
                        "data-premium-plan"
                    );

                price =
                    window.psychoPremiumPrice(
                        tier,
                        plan
                    );
            }

            var slot =
                card.querySelector(
                    "[data-price-slot]"
                );

            if (price === null) {

                if (slot) {
                    slot.textContent =
                        "قیمت آنلاین موقتاً در دسترس نیست";
                }

                card.setAttribute(
                    "data-price",
                    ""
                );

            } else {

                if (slot) {

                    slot.textContent =
                        fmt(price) +
                        " تومان";
                }

                card.setAttribute(
                    "data-price",
                    price
                );

                card.setAttribute(
                    "data-unit",
                    "1"
                );
            }
        });

        renderCustomStarsBox();
    }

    /* =====================================================
       CUSTOM STARS
       ===================================================== */

    function renderCustomStarsBox() {

        var input =
            document.getElementById(
                "starsCustomQty"
            );

        var out =
            document.getElementById(
                "starsCustomPriceOut"
            );

        var card =
            document.getElementById(
                "starsCustomCard"
            );

        var label =
            document.getElementById(
                "starsCustomQtyLabel"
            );

        if (
            !input ||
            !out ||
            !card
        ) {
            return;
        }

        var qty =
            parseInt(
                input.value,
                10
            );

        if (!qty || qty <= 0) {

            out.textContent =
                "تعداد استار را وارد کنید";

            card.setAttribute(
                "data-price",
                ""
            );

            return;
        }

        if (label) {

            label.textContent =
                "(" +
                fmt(qty) +
                " استار)";
        }

        var price =
            window.psychoStarsPrice(
                qty
            );

        if (price === null) {

            out.textContent =
                "در حال دریافت قیمت آنی...";

            card.setAttribute(
                "data-price",
                ""
            );

        } else {

            out.textContent =
                fmt(qty) +
                " استار = " +
                fmt(price) +
                " تومان";

            card.setAttribute(
                "data-price",
                price
            );

            card.setAttribute(
                "data-unit",
                "1"
            );
        }
    }

    /* =====================================================
       تغییر تعداد Custom Stars
       ===================================================== */

    document.addEventListener(
        "input",
        function (e) {

            if (
                e.target &&
                e.target.id ===
                    "starsCustomQty"
            ) {
                renderCustomStarsBox();
            }
        }
    );

    /* =====================================================
       Listener اصلی
       ===================================================== */

    listeners.push(
        renderCards
    );

    /* =====================================================
       INIT
       ===================================================== */

    function init() {

        fetchPrices();

        setInterval(
            fetchPrices,
            REFRESH_MS
        );
    }

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init
        );

    } else {

        init();
    }

    /* =====================================================
       DEBUG
       ===================================================== */

    window.__psychoPricing = {

        fetchPrices: fetchPrices,

        get data() {
            return priceData;
        },

        get premiumDeductions() {
            return PREMIUM_DEDUCTION;
        }
    };

})();
