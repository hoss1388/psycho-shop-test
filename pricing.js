/* =========================================================
   Psycho Shop - Fragment Live Pricing Engine
   ---------------------------------------------------------
   Premium pricing:
   - Reads live raw Premium prices from api/prices.json
   - Applies proportional pricing coefficients
   - Single Boost and Four Boost use different coefficients
   - Prices automatically change when Fragment's raw price changes
   ========================================================= */

(function () {
    "use strict";

    console.log("[pricing] pricing.js loaded");

    var PRICE_ENDPOINT = "api/prices.json";

    // سایت هر 3 دقیقه prices.json را دوباره بررسی می‌کند
    var REFRESH_MS = 3 * 60 * 1000;


    /* =====================================================
       PREMIUM COEFFICIENTS
       -----------------------------------------------------
       Based on the current raw prices:

       Raw:
       3m  = 2,593,248
       6m  = 4,840,730
       12m = 8,644,160

       Target:

       SINGLE
       3m  = 2,340,000
       6m  = 3,100,000
       12m = 5,520,000

       FOUR
       3m  = 2,500,000
       6m  = 3,300,000
       12m = 5,725,000

       Formula:

       final = raw × coefficient
       ===================================================== */

    var PREMIUM_COEFFICIENTS = {

        single: {
            "3m": 2340000 / 2593248,
            "6m": 3100000 / 4840730,
            "12m": 5520000 / 8644160
        },

        four: {
            "3m": 2500000 / 2593248,
            "6m": 3300000 / 4840730,
            "12m": 5725000 / 8644160
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


    /* =====================================================
       HELPERS
       ===================================================== */

    function roundTo(number, step) {

        step = step || 1000;

        return Math.ceil(number / step) * step;
    }


    function toNumber(value) {

        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        var number = Number(
            String(value).replace(/,/g, "")
        );

        return Number.isFinite(number) && number > 0
            ? number
            : null;
    }


    function formatPrice(number) {

        return Math.round(number || 0)
            .toString()
            .replace(
                /\B(?=(\d{3})+(?!\d))/g,
                ","
            );
    }


    /* =====================================================
       LOAD prices.json
       ===================================================== */

    function fetchPrices() {

        return fetch(
            PRICE_ENDPOINT + "?_=" + Date.now(),
            {
                cache: "no-store"
            }
        )

        .then(function (response) {

            if (!response.ok) {

                throw new Error(
                    "HTTP " + response.status
                );
            }

            return response.json();
        })

        .then(function (data) {

            if (
                !data ||
                !data.premium ||
                !data.premium.single
            ) {

                throw new Error(
                    "premium.single not found"
                );
            }


            priceData = data;


            console.log(
                "[pricing] Live prices loaded:",
                priceData
            );


            renderCards();
            renderCustomStarsBox();


            return data;
        })

        .catch(function (error) {

            console.error(
                "[pricing] Failed to load prices.json:",
                error
            );

            /*
             * اگر قیمت قبلی معتبر داریم،
             * همان را نگه می‌داریم.
             */

            renderCards();
            renderCustomStarsBox();
        });
    }


    /* =====================================================
       STARS RAW PRICE
       ===================================================== */

    function starsRawToman(qty) {

        if (
            !priceData ||
            !priceData.tonToToman
        ) {

            return null;
        }


        var rate =
            toNumber(
                priceData.tonToToman
            );


        if (rate === null) {
            return null;
        }


        if (
            priceData.stars &&
            priceData.stars.tonPerStar
        ) {

            var tonPerStar =
                toNumber(
                    priceData.stars.tonPerStar
                );


            if (tonPerStar !== null) {

                return (
                    tonPerStar *
                    qty *
                    rate
                );
            }
        }


        return null;
    }


    /* =====================================================
       STARS FINAL PRICE
       ===================================================== */

    window.psychoStarsPrice =
        function (qty) {

            qty = parseInt(
                qty,
                10
            );


            if (
                !qty ||
                qty <= 0
            ) {

                return null;
            }


            if (
                Object.prototype.hasOwnProperty.call(
                    FIXED_STARS,
                    qty
                )
            ) {

                return FIXED_STARS[qty];
            }


            var raw =
                starsRawToman(qty);


            if (raw === null) {

                return null;
            }


            return (
                roundTo(
                    raw,
                    500
                ) +
                MARGIN_STARS
            );
        };


    /* =====================================================
       PREMIUM RAW PRICE
       -----------------------------------------------------
       مهم:
       قیمت خام مستقیماً از مقدار toman داخل
       prices.json گرفته می‌شود.

       مثال:

       "3m": {
           "ton": 10.5,
           "toman": 2593248
       }

       ما 2593248 را به عنوان raw price می‌گیریم.
       ===================================================== */

    function premiumRawToman(plan) {

        if (
            !priceData ||
            !priceData.premium ||
            !priceData.premium.single
        ) {

            return null;
        }


        var item =
            priceData
                .premium
                .single[plan];


        if (!item) {
            return null;
        }


        /*
         * فرمت فعلی prices.json
         */

        if (
            typeof item === "object" &&
            item.toman !== undefined
        ) {

            var toman =
                toNumber(
                    item.toman
                );


            if (toman !== null) {

                return toman;
            }
        }


        /*
         * Fallback:
         * اگر toman وجود نداشت،
         * از TON × نرخ TON استفاده می‌کنیم.
         */

        if (
            typeof item === "object" &&
            item.ton !== undefined &&
            priceData.tonToToman
        ) {

            var ton =
                toNumber(
                    item.ton
                );


            var rate =
                toNumber(
                    priceData.tonToToman
                );


            if (
                ton !== null &&
                rate !== null
            ) {

                return (
                    ton *
                    rate
                );
            }
        }


        return null;
    }


    /* =====================================================
       PREMIUM FINAL PRICE
       -----------------------------------------------------
       Formula:

       final price =
       raw price × coefficient

       بنابراین وقتی Fragment قیمت خام را تغییر دهد،
       قیمت سایت نیز به همان نسبت تغییر می‌کند.
       ===================================================== */

    window.psychoPremiumPrice =
        function (
            tier,
            plan
        ) {

            if (
                tier !== "single" &&
                tier !== "four"
            ) {

                tier = "single";
            }


            if (
                !PREMIUM_COEFFICIENTS[tier] ||
                !PREMIUM_COEFFICIENTS[tier][plan]
            ) {

                return null;
            }


            var raw =
                premiumRawToman(plan);


            if (raw === null) {

                return null;
            }


            var coefficient =
                PREMIUM_COEFFICIENTS[tier][plan];


            var finalPrice =
                raw * coefficient;


            if (
                !Number.isFinite(
                    finalPrice
                ) ||
                finalPrice <= 0
            ) {

                return null;
            }


            /*
             * گرد کردن قیمت به نزدیک‌ترین
             * 1000 تومان
             */

            return roundTo(
                finalPrice,
                1000
            );
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

            var request =
                card.getAttribute(
                    "data-request"
                );


            var price = null;


            /* -------------------------
               STARS
               ------------------------- */

            if (
                request === "stars"
            ) {

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
            }


            /* -------------------------
               PREMIUM
               ------------------------- */

            if (
                request === "premium"
            ) {

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


            /* -------------------------
               PRICE UNAVAILABLE
               ------------------------- */

            if (price === null) {

                if (slot) {

                    slot.textContent =
                        "قیمت آنلاین موقتاً در دسترس نیست";
                }


                card.setAttribute(
                    "data-price",
                    ""
                );


                return;
            }


            /* -------------------------
               DISPLAY PRICE
               ------------------------- */

            if (slot) {

                slot.textContent =
                    formatPrice(price) +
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


        var output =
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
            !output ||
            !card
        ) {

            return;
        }


        var qty =
            parseInt(
                input.value,
                10
            );


        if (
            !qty ||
            qty <= 0
        ) {

            output.textContent =
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
                formatPrice(qty) +
                " استار)";
        }


        var price =
            window.psychoStarsPrice(
                qty
            );


        if (price === null) {

            output.textContent =
                "قیمت آنلاین موقتاً در دسترس نیست";


            card.setAttribute(
                "data-price",
                ""
            );


            return;
        }


        output.textContent =
            formatPrice(qty) +
            " استار = " +
            formatPrice(price) +
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


    /* =====================================================
       CUSTOM STARS INPUT
       ===================================================== */

    document.addEventListener(
        "input",
        function (event) {

            if (
                event.target &&
                event.target.id ===
                    "starsCustomQty"
            ) {

                renderCustomStarsBox();
            }
        }
    );


    /* =====================================================
       INITIALIZATION
       ===================================================== */

    function init() {

        fetchPrices();


        /*
         * هر 3 دقیقه قیمت جدید را بررسی می‌کند.
         */

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

        fetchPrices:
            fetchPrices,

        get data() {
            return priceData;
        },

        get coefficients() {
            return PREMIUM_COEFFICIENTS;
        }
    };


})();
