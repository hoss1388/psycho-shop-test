/* =========================================================
   Psycho Shop - Fragment Live Pricing Engine
   ---------------------------------------------------------
   Premium:
   - Reads the common Premium base price from api/prices.json
   - Supports prices stored as:
       { ton: 10.5, toman: 2593248 }
   - Same base price for Single Boost and Four Boost
   - Separate deductions for Single/Four Boost
   - Deductions are currently 0

   Stars:
   - Keeps existing fixed prices for 13 and 21 Stars
   - Other packages use the live data
   ========================================================= */

(function () {
    "use strict";

    console.log("[pricing] pricing.js loaded");

    var PRICE_ENDPOINT = "api/prices.json";

    // Refresh every 3 minutes
    var REFRESH_MS = 3 * 60 * 1000;

    // Reject prices older than 15 minutes
    var MAX_PRICE_AGE_MS = 15 * 60 * 1000;


    /* =====================================================
       PREMIUM DEDUCTIONS
       -----------------------------------------------------
       These are intentionally 0 for now.

       Later, if you want for example:

       Single 3 months:
       base - 300000

       Four 3 months:
       base - 700000

       simply change the numbers below.
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
       STARS SETTINGS
       ===================================================== */

    var MARGIN_STARS = 47000;

    var FIXED_STARS = {
        13: 50000,
        21: 165000
    };


    /* =====================================================
       INTERNAL STATE
       ===================================================== */

    var priceData = null;

    var listeners = [];


    /* =====================================================
       HELPERS
       ===================================================== */

    function roundTo(n, step) {

        step = step || 1000;

        return Math.ceil(n / step) * step;
    }


    function toFiniteNumber(value) {

        var numeric;

        if (typeof value === "string") {

            numeric = Number(
                value.replace(/,/g, "")
            );

        } else {

            numeric = Number(value);
        }

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
       PREMIUM DATA VALIDATION
       ===================================================== */

    function isFreshPremiumPayload(data) {

        if (
            !data ||
            !data.premium ||
            !data.premium.single ||
            !data.updatedAt ||
            !data.tonToToman
        ) {

            return false;
        }


        var updatedAt = Date.parse(
            data.updatedAt
        );

        var age =
            Date.now() - updatedAt;


        if (
            !Number.isFinite(updatedAt) ||
            age < -60000 ||
            age > MAX_PRICE_AGE_MS
        ) {

            return false;
        }


        if (
            toFiniteNumber(
                data.tonToToman
            ) === null
        ) {

            return false;
        }


        /*
         * Current prices.json format:

         premium.single["3m"] = {
             ton: 10.5,
             toman: 2593248
         }

         We accept both:

         1. Object format:
            { ton: 10.5, toman: 2593248 }

         2. Number format:
            10.5
        */

        var validPlans =
            ["3m", "6m", "12m"];


        return validPlans.every(
            function (plan) {

                var value =
                    data.premium.single[plan];

                if (
                    value &&
                    typeof value === "object"
                ) {

                    return (
                        toFiniteNumber(
                            value.toman
                        ) !== null ||
                        toFiniteNumber(
                            value.ton
                        ) !== null
                    );
                }


                return (
                    toFiniteNumber(value) !== null
                );
            }
        );
    }


    /* =====================================================
       FETCH PRICES
       ===================================================== */

    function fetchPrices() {

        console.log(
            "[pricing] Fetching:",
            PRICE_ENDPOINT
        );


        return fetch(
            PRICE_ENDPOINT +
            "?_=" +
            Date.now(),
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

            if (
                !isFreshPremiumPayload(data)
            ) {

                throw new Error(
                    "prices.json is invalid or outdated"
                );
            }


            priceData = data;


            console.log(
                "[pricing] Live prices loaded:",
                priceData
            );


            notify();


            return data;
        })

        .catch(function (err) {

            /*
             * Do NOT destroy previously loaded
             * valid data if a temporary network
             * error happens.
             */

            console.warn(
                "[pricing] Live prices unavailable:",
                err
            );


            notify();
        });
    }


    /* =====================================================
       NOTIFY
       ===================================================== */

    function notify() {

        listeners.forEach(
            function (fn) {

                try {

                    fn(priceData);

                } catch (e) {

                    console.error(
                        "[pricing] Listener error:",
                        e
                    );
                }
            }
        );
    }


    /* =====================================================
       STARS RAW PRICE
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


            /*
             * Fixed Stars prices
             */

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
       PREMIUM BASE PRICE
       -----------------------------------------------------
       IMPORTANT:

       We intentionally use the SAME base price
       for Single Boost and Four Boost.

       If prices.json contains:

       {
         "ton": 10.5,
         "toman": 2593248
       }

       we use the "toman" value directly.

       This avoids converting TON a second time.
       ===================================================== */

    function premiumBaseToman(plan) {

        if (
            !priceData ||
            !priceData.premium ||
            !priceData.premium.single
        ) {

            return null;
        }


        var value =
            priceData
                .premium
                .single[plan];


        if (!value) {

            return null;
        }


        /*
         * Current format:
         *
         * {
         *   ton: 10.5,
         *   toman: 2593248
         * }
         *
         * Prefer the already calculated
         * toman value.
         */

        if (
            typeof value === "object"
        ) {

            var toman =
                toFiniteNumber(
                    value.toman
                );


            if (toman !== null) {

                return toman;
            }


            /*
             * Fallback:
             * If toman is missing but TON exists,
             * calculate it using the current TON rate.
             */

            var ton =
                toFiniteNumber(
                    value.ton
                );


            var tonToToman =
                toFiniteNumber(
                    priceData.tonToToman
                );


            if (
                ton !== null &&
                tonToToman !== null
            ) {

                return (
                    ton *
                    tonToToman
                );
            }


            return null;
        }


        /*
         * Compatibility with old format where
         * the value itself was TON.
         */

        var numericTon =
            toFiniteNumber(value);


        var rate =
            toFiniteNumber(
                priceData.tonToToman
            );


        if (
            numericTon === null ||
            rate === null
        ) {

            return null;
        }


        return (
            numericTon *
            rate
        );
    }


    /* =====================================================
       PREMIUM FINAL PRICE
       -----------------------------------------------------
       tier:
         single = Single Boost
         four   = Four Boost

       plan:
         3m
         6m
         12m

       Formula:

         Base Price
           -
         Tier Deduction
           =
         Final Price
       ===================================================== */

    window.psychoPremiumPrice =
        function (
            tier,
            plan
        ) {

            /*
             * Make sure tier is valid.
             */

            if (
                tier !== "single" &&
                tier !== "four"
            ) {

                tier = "single";
            }


            /*
             * Get common Premium base price.
             */

            var base =
                premiumBaseToman(
                    plan
                );


            if (base === null) {

                return null;
            }


            /*
             * Get deduction.
             */

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
             * Round the common base price.
             */

            var roundedBase =
                roundTo(
                    base,
                    1000
                );


            /*
             * Apply deduction.
             */

            var finalPrice =
                roundedBase -
                deduction;


            /*
             * Never allow zero/negative price.
             */

            if (
                !Number.isFinite(
                    finalPrice
                ) ||
                finalPrice <= 0
            ) {

                return null;
            }


            return finalPrice;
        };


    /* =====================================================
       RENDER SERVICE CARDS
       ===================================================== */

    function renderCards() {

        var cards =
            document.querySelectorAll(
                ".service-card[data-request='stars'][data-stars-qty]," +
                ".service-card[data-request='premium'][data-premium-tier]"
            );


        cards.forEach(
            function (card) {

                var price = null;


                var request =
                    card.getAttribute(
                        "data-request"
                    );


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

                else {

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
                        fmt(price) +
                        " تومان";
                }


                /*
                 * IMPORTANT:
                 * script.js can read this
                 * when adding product to cart.
                 */

                card.setAttribute(
                    "data-price",
                    price
                );


                card.setAttribute(
                    "data-unit",
                    "1"
                );
            }
        );


        renderCustomStarsBox();
    }


    /* =====================================================
       CUSTOM STARS BOX
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


        if (
            !qty ||
            qty <= 0
        ) {

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


            return;
        }


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


    /* =====================================================
       CUSTOM STARS INPUT
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
       REGISTER RENDER LISTENER
       ===================================================== */

    listeners.push(
        renderCards
    );


    /* =====================================================
       INITIALIZATION
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
       DEBUG API
       ===================================================== */

    window.__psychoPricing = {

        fetchPrices:
            fetchPrices,

        get data() {
            return priceData;
        },

        get premiumDeductions() {
            return PREMIUM_DEDUCTION;
        },

        get premiumBase() {

            return function (plan) {

                return premiumBaseToman(
                    plan
                );
            };
        }
    };


})();
