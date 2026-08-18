/* =========================================================
   Psycho Shop - Simple Live Premium Pricing
   ========================================================= */

(function () {
    "use strict";

    console.log("[pricing] pricing.js loaded");

    var PRICE_ENDPOINT = "api/prices.json";
    var REFRESH_MS = 3 * 60 * 1000;

    /*
     * Premium deductions
     *
     * فعلاً صفر هستند تا قیمت واقعی پایه را ببینیم.
     * بعداً فقط همین اعداد را تغییر می‌دهیم.
     */

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


    /*
     * Stars
     */

    var MARGIN_STARS = 47000;

    var FIXED_STARS = {
        13: 50000,
        21: 165000
    };


    var priceData = null;


    /* =====================================================
       Helpers
       ===================================================== */

    function roundTo(number, step) {
        step = step || 1000;
        return Math.ceil(number / step) * step;
    }


    function toNumber(value) {

        if (value === null || value === undefined) {
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
            .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }


    /* =====================================================
       Load prices.json
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

            /*
             * فقط چیزهایی که واقعاً در
             * prices.json تو وجود دارند را بررسی می‌کنیم.
             */

            if (
                !data ||
                !data.premium ||
                !data.premium.single
            ) {

                throw new Error(
                    "premium.single در prices.json پیدا نشد"
                );
            }


            priceData = data;


            console.log(
                "[pricing] prices.json loaded",
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
             * اینجا دیگر قیمت را به خاطر
             * health/sources و غیره مخفی نمی‌کنیم.
             */

            renderCards();
            renderCustomStarsBox();
        });
    }


    /* =====================================================
       Stars
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


        /*
         * اگر tonPerStar وجود داشته باشد
         */

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


        /*
         * اگر stars موجود نبود،
         * فعلاً قیمت استارز را نداریم.
         */

        return null;
    }


    window.psychoStarsPrice =
        function (qty) {

            qty = parseInt(qty, 10);


            if (!qty || qty <= 0) {
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
                roundTo(raw, 500) +
                MARGIN_STARS
            );
        };


    /* =====================================================
       Premium
       ===================================================== */

    function getPremiumBaseToman(plan) {

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
         * ساختار فعلی prices.json:
         *
         * "3m": {
         *     "ton": 10.5,
         *     "toman": 2593248
         * }
         *
         * مستقیماً toman را استفاده می‌کنیم.
         */

        if (
            typeof item === "object" &&
            item.toman !== undefined
        ) {

            var toman =
                toNumber(item.toman);


            if (toman !== null) {
                return toman;
            }
        }


        /*
         * Fallback:
         * اگر toman نبود ولی ton وجود داشت،
         * با نرخ TON تبدیل می‌کنیم.
         */

        if (
            typeof item === "object" &&
            item.ton !== undefined &&
            priceData.tonToToman
        ) {

            var ton =
                toNumber(item.ton);


            var rate =
                toNumber(
                    priceData.tonToToman
                );


            if (
                ton !== null &&
                rate !== null
            ) {

                return ton * rate;
            }
        }


        return null;
    }


    window.psychoPremiumPrice =
        function (tier, plan) {

            /*
             * فقط دو نوع داریم:
             *
             * single = تک بوست
             * four   = چهار بوست
             */

            if (
                tier !== "single" &&
                tier !== "four"
            ) {

                tier = "single";
            }


            var base =
                getPremiumBaseToman(plan);


            if (base === null) {
                return null;
            }


            var deduction = 0;


            if (
                PREMIUM_DEDUCTION[tier] &&
                PREMIUM_DEDUCTION[tier][plan] !== undefined
            ) {

                deduction =
                    Number(
                        PREMIUM_DEDUCTION[tier][plan]
                    ) || 0;
            }


            /*
             * قیمت پایه مشترک
             * منهای مبلغ مخصوص همان نوع
             */

            var finalPrice =
                roundTo(base, 1000) -
                deduction;


            if (
                !Number.isFinite(finalPrice) ||
                finalPrice <= 0
            ) {

                return null;
            }


            return finalPrice;
        };


    /* =====================================================
       Render Cards
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


            /*
             * Stars
             */

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
            }


            /*
             * Premium
             */

            if (request === "premium") {

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


                return;
            }


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
       Custom Stars
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
       Custom Stars Input
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
       Start
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
       Debug
       ===================================================== */

    window.__psychoPricing = {

        fetchPrices: fetchPrices,

        get data() {
            return priceData;
        },

        get deductions() {
            return PREMIUM_DEDUCTION;
        }
    };

})();
