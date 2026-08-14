/* =========================================================
   Psycho Shop - Shared Cart Engine
   این فایل در همه صفحات لود می‌شود و مسئول:
   - نگهداری سبد خرید در localStorage
   - نمایش دکمه شناور سبد خرید + تعداد آیتم‌ها
   - نمایش کشوی سبد خرید با لیست کالاها و جمع قیمت
   - ثبت سفارش نهایی از طریق تلگرام
   ========================================================= */
(function () {
    "use strict";

    var CART_KEY = "psychoCart";
    var TELEGRAM_SUPPORT = "https://t.me/psycho_supp";

    /* ---------------- Storage helpers ---------------- */
    function getCart() {
        try {
            var raw = localStorage.getItem(CART_KEY);
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveCart(cart) {
        try {
            localStorage.setItem(CART_KEY, JSON.stringify(cart));
        } catch (e) {
            /* ignore quota / privacy errors */
        }
        updateBadge();
    }

    function formatNumber(n) {
        n = Math.round(n || 0);
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function lineTotal(item) {
        var unit = parseFloat(item.unitCount) || 1;
        var price = parseFloat(item.unitPrice) || 0;
        var qty = parseFloat(item.qty) || 0;
        return Math.round((price / unit) * qty);
    }

    function cartTotal(cart) {
        return cart.reduce(function (sum, item) {
            return sum + lineTotal(item);
        }, 0);
    }

    function cartCount(cart) {
        return cart.length;
    }

    function normalizeExtraInfo(extraInfo) {
        if (!extraInfo) return { text: "", meta: null };
        if (typeof extraInfo === "object") {
            if (extraInfo.details !== undefined) {
                return {
                    text: String(extraInfo.details || ""),
                    meta: extraInfo.meta && typeof extraInfo.meta === "object" ? extraInfo.meta : null
                };
            }
            return {
                text: "گیرنده: " + (extraInfo.receiver || "") + "\nمتن: " + (extraInfo.text || ""),
                meta: null
            };
        }
        return { text: String(extraInfo), meta: null };
    }

    function isBoostItem(item) {
        return !!(item && item.meta && item.meta.productType === "telegram-boost");
    }

    function isTelegramDestination(value) {
        var target = String(value || "").trim();
        return /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:\+|joinchat\/)?[A-Za-z0-9_-]+(?:[/?#].*)?$/i.test(target);
    }

    function getBoostDestination(item) {
        if (item && item.meta && item.meta.destinationUrl) {
            return String(item.meta.destinationUrl).trim();
        }
        var legacyMatch = String((item && item.extraInfo) || "").match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^\s]+/i);
        return legacyMatch ? legacyMatch[0] : "";
    }

    /* ---------------- Public API ---------------- */
    window.psychoAddToCart = function (id, name, unitPrice, unitCount, qty, unitLabel, extraInfo) {
        qty = parseFloat(qty);
        unitPrice = parseFloat(unitPrice);
        unitCount = parseFloat(unitCount) || 1;

        if (!id || !name || isNaN(unitPrice)) {
            psychoToast("خطا در افزودن محصول");
            return;
        }
        if (!qty || qty <= 0) {
            psychoToast("لطفاً تعداد معتبر وارد کنید");
            return;
        }

        var cart = getCart();
        var existing = null;
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].id === id) {
                existing = cart[i];
                break;
            }
        }

        if (existing) {
            existing.qty = (parseFloat(existing.qty) || 0) + qty;
        } else {
            var normalizedInfo = normalizeExtraInfo(extraInfo);
            cart.push({
                id: id,
                name: name,
                unitPrice: unitPrice,
                unitCount: unitCount,
                qty: qty,
                unitLabel: unitLabel || "",
                extraInfo: normalizedInfo.text,
                meta: normalizedInfo.meta
            });
        }

        saveCart(cart);
        renderDrawer();
        psychoToast("به سبد خرید اضافه شد");
        pulseFab();
    };

    // دکمه‌های عمومی "افزودن به سبد خرید" داخل کارت‌های محصول از این تابع استفاده می‌کنند
    window.psychoAddFromCard = function (btn) {
        var card = btn.closest(".country-card") || btn.closest(".service-card");
        if (!card) return;

        var price = parseFloat(card.getAttribute("data-price"));
        var unit = parseFloat(card.getAttribute("data-unit") || "1") || 1;
        if (isNaN(price)) {
            psychoToast("قیمت این محصول در دسترس نیست");
            return;
        }

        var qtyInput = card.querySelector(".qty-input") || card.querySelector(".calc-input");
        var qty = qtyInput ? parseFloat(qtyInput.value) : 1;
        if (!qty || qty <= 0) {
            psychoToast("لطفاً تعداد معتبر وارد کنید");
            if (qtyInput) qtyInput.focus();
            return;
        }

        var nameEl = card.querySelector("h3");
        var name = nameEl ? nameEl.textContent.replace(/\s+/g, " ").trim() : "محصول";
        var requestType = card.getAttribute("data-request") || "";
        var productType = card.getAttribute("data-product-type") || "";
        var isBoost = card.hasAttribute("data-boost");

        if (isBoost) {
            name = "Boost " + name;
            requestType = "boost";
            productType = "telegram-boost";
        }

        var baseId = name + "|" + price + "|" + unit;

        if (requestType === "boost" || requestType === "channel" || requestType === "gift") {
            openProductModal(requestType, function (value) {
                var idValue = typeof value === "object" ? (value.receiver || "") + "|" + (value.text || "") : value;
                var info = value;

                if (isBoost) {
                    var duration = nameEl ? nameEl.textContent.replace(/\s+/g, " ").trim() : "";
                    info = {
                        details: "نوع محصول: Telegram Boost\nمدت زمان: " + duration + "\nلینک مقصد: " + value,
                        meta: {
                            productType: "telegram-boost",
                            duration: duration,
                            destinationUrl: value
                        }
                    };
                }

                window.psychoAddToCart(baseId + "|" + idValue, name, price, unit, qty, "", info);
            });
            return;
        }

        var extraInfo = "";
        if (productType === "virtual-account") {
            var country = card.getAttribute("data-country") || "";
            extraInfo = {
                details: "نوع محصول: اکانت مجازی\nکشور: " + country,
                meta: { productType: "virtual-account", country: country }
            };
        }

        window.psychoAddToCart(baseId, name, price, unit, qty, "", extraInfo);

        var resultEl = card.querySelector(".calc-result");
        if (resultEl) {
            var total = Math.round((price / unit) * qty);
            resultEl.textContent = "قیمت شما: " + formatNumber(total) + " تومان";
        }
    };

    // دکمه‌های + / - برای تعداد بسته‌های ثابت (مثل بوست، گیفت و ...)
    window.psychoQtyStep = function (btn, delta) {
        var wrap = btn.closest(".qty-stepper");
        if (!wrap) return;
        var input = wrap.querySelector(".qty-input");
        if (!input) return;
        var v = parseInt(input.value, 10);
        if (isNaN(v)) v = 1;
        v += delta;
        if (v < 1) v = 1;
        input.value = v;
    };

    window.psychoRemoveFromCart = function (id) {
        var cart = getCart().filter(function (i) {
            return i.id !== id;
        });
        saveCart(cart);
        renderDrawer();
    };

    window.psychoChangeCartQty = function (id, delta) {
        var cart = getCart();
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].id === id) {
                var v = (parseFloat(cart[i].qty) || 1) + delta;
                if (v < 1) v = 1;
                cart[i].qty = v;
                break;
            }
        }
        saveCart(cart);
        renderDrawer();
    };

    window.psychoClearCart = function () {
        saveCart([]);
        renderDrawer();
    };

    window.psychoCheckout = function () {
        var cart = getCart();
        if (cart.length === 0) {
            psychoToast("سبد خرید شما خالی است");
            return;
        }

        var invalidBoost = cart.some(function (item) {
            return isBoostItem(item) && !isTelegramDestination(getBoostDestination(item));
        });
        if (invalidBoost) {
            psychoToast("برای ادامه خرید Boost، لینک چنل یا گروه تلگرام را وارد کنید");
            return;
        }

        var lines = cart.map(function (item, idx) {
           return (idx + 1) + ". " + item.name +
"\n" + (isBoostItem(item) ? "تعداد Boost: " : "تعداد: ") + formatNumber(item.qty) +
"\nقیمت: " + formatNumber(lineTotal(item)) + " تومان" +
(item.extraInfo ? "\n📌 اطلاعات سفارش: " + item.extraInfo : "");
        });

        var total = cartTotal(cart);
        var msg = "🛒 سفارش جدید از سایت Psycho Shop:\n\n" +
            lines.join("\n") +
            "\n\n💰 جمع کل: " + formatNumber(total) + " تومان" +
            "\n\nلطفاً جهت تکمیل پرداخت و ثبت نهایی سفارش راهنمایی بفرمایید.";

        var url = TELEGRAM_SUPPORT + "?text=" + encodeURIComponent(msg);
        window.open(url, "_blank");
    };

    /* ---------------- Toast ---------------- */
    var toastTimer = null;
    window.psychoToast = function (text) {
        var el = document.getElementById("pcartToast");
        if (!el) return;
        el.textContent = text;
        el.classList.add("pcart-toast-show");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            el.classList.remove("pcart-toast-show");
        }, 2200);
    };
window.openProductModal = function(type, callback) {
    var modal = document.getElementById("pmodalOverlay");
    var title = document.getElementById("pmodalTitle");
    var input = document.getElementById("pmodalInput");
    var text = document.getElementById("pmodalText");
    var submit = document.getElementById("pmodalSubmit");
    var cancel = document.getElementById("pmodalCancel");

    if (!modal) return;

    if (type === "page") {
        title.textContent = "لینک پیج اینستاگرام خود را وارد کنید";
        input.placeholder = "مثلاً instagram.com/example";
    }
    else if (type === "boost") {
        title.textContent = "لینک چنل یا گروه برای Boost را وارد کنید";
        input.placeholder = "مثلاً https://t.me/example";
    }
    else if (type === "channel") {
        title.textContent = "لینک چنل را وارد کنید";
        input.placeholder = "مثلاً https://t.me/example";
    }
    else if (type === "post") {
        title.textContent = "لینک پست را وارد کنید";
        input.placeholder = "لینک پست";
    }
    else if (type === "gift") {
    title.textContent = "اطلاعات گیفت استارزی";

    input.placeholder = "آیدی گیرنده گیفت";

    text.style.display = "block";
    text.placeholder = "متن دلخواه زیر گیفت";
}
    else if (type === "gift") {
    title.textContent = "آیدی گیرنده و متن گیفت را وارد کنید";
    input.placeholder = "مثلاً @username | متن گیفت";
}
    input.value = "";
    if (text) {
    text.value = "";
    text.style.display = "none";
}
    modal.classList.add("active");
    input.focus();
var textBox = document.getElementById("pmodalText");

if (textBox) {
    textBox.style.display = type === "gift" ? "block" : "none";
    textBox.value = "";
}
    submit.onclick = function () {

    var value = input.value.trim();

    if (!value) {
        psychoToast("لطفاً اطلاعات را وارد کنید");
        return;
    }

    if (type === "boost" && !isTelegramDestination(value)) {
        psychoToast("لینک معتبر چنل یا گروه تلگرام را وارد کنید");
        input.focus();
        return;
    }

    var textBox = document.getElementById("pmodalText");
    var extraText = textBox ? textBox.value.trim() : "";

    modal.classList.remove("active");

    if (callback) {

        if (type === "gift") {

            callback({
                receiver: value,
                text: extraText
            });

        } else {

            callback(value);

        }

    }
};

    cancel.onclick = function () {
        modal.classList.remove("active");
    };
};
    /* ---------------- UI building ---------------- */
    function updateBadge() {
        var badge = document.getElementById("pcartBadge");
        if (!badge) return;
        var count = cartCount(getCart());
        if (count > 0) {
            badge.textContent = count > 99 ? "99+" : count;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    }

    function pulseFab() {
        var fab = document.getElementById("pcartFab");
        if (!fab) return;
        fab.classList.remove("pcart-fab-pulse");
        void fab.offsetWidth;
        fab.classList.add("pcart-fab-pulse");
    }

    function renderDrawer() {
        var body = document.getElementById("pcartBody");
        var footer = document.getElementById("pcartFooter");
        if (!body || !footer) return;

        var cart = getCart();

        if (cart.length === 0) {
            body.innerHTML =
                '<div class="pcart-empty">' +
                '<i class="fa-solid fa-cart-shopping"></i>' +
                '<p>سبد خرید شما خالی است</p>' +
                "</div>";
            footer.style.display = "none";
            return;
        }

        var html = "";
        cart.forEach(function (item) {
            var total = lineTotal(item);
            var sub = item.unitCount && item.unitCount != 1
                ? "هر " + formatNumber(item.unitCount) + " عدد، " + formatNumber(item.unitPrice) + " تومان"
                : formatNumber(item.unitPrice) + " تومان / عدد";

            html +=
                '<div class="pcart-item">' +
                '<div class="pcart-item-main">' +
                '<div class="pcart-item-name">' + escapeHtml(item.name) + "</div>" +
                '<div class="pcart-item-sub">' + sub + "</div>" +
                (isBoostItem(item) ? '<div class="pcart-item-info">تعداد Boost: ' + formatNumber(item.qty) + "</div>" : "") +
                (item.extraInfo ? '<div class="pcart-item-info">📌 ' + escapeHtml(item.extraInfo).replace(/\n/g, "<br>") + "</div>" : "") +
                '<div class="pcart-item-qty">' +
                '<button type="button" class="pcart-qty-btn" onclick="psychoChangeCartQty(\'' + escapeAttr(item.id) + "', -1)\">−</button>" +
                '<span class="pcart-qty-val">' + formatNumber(item.qty) + "</span>" +
                '<button type="button" class="pcart-qty-btn" onclick="psychoChangeCartQty(\'' + escapeAttr(item.id) + "', 1)\">+</button>" +
                "</div>" +
                "</div>" +
                '<div class="pcart-item-side">' +
                '<div class="pcart-item-price">' + formatNumber(total) + " تومان</div>" +
                '<button type="button" class="pcart-remove-btn" onclick="psychoRemoveFromCart(\'' + escapeAttr(item.id) + "')\"><i class=\"fa-solid fa-trash\"></i></button>" +
                "</div>" +
                "</div>";
        });

        body.innerHTML = html;
        footer.style.display = "block";

        var totalEl = document.getElementById("pcartTotal");
        if (totalEl) totalEl.textContent = formatNumber(cartTotal(cart)) + " تومان";
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }
    function escapeAttr(str) {
        return String(str).replace(/'/g, "\\'");
    }

    function openDrawer() {
        document.getElementById("pcartOverlay").classList.add("pcart-open");
        document.getElementById("pcartDrawer").classList.add("pcart-open");
        document.body.style.overflow = "hidden";
    }
    function closeDrawer() {
        document.getElementById("pcartOverlay").classList.remove("pcart-open");
        document.getElementById("pcartDrawer").classList.remove("pcart-open");
        document.body.style.overflow = "";
    }

    /* ---------------- Inject CSS ---------------- */
    function injectStyles() {
        var css = "" +
            ".pcart-fab{position:fixed;bottom:25px;left:25px;width:62px;height:62px;border-radius:50%;" +
            "background:linear-gradient(135deg,#ff6a00,#ff9d00);display:flex;align-items:center;justify-content:center;" +
            "box-shadow:0 0 30px rgba(255,120,0,.55);cursor:pointer;z-index:99998;border:none;color:#111;font-size:24px;" +
            "transition:transform .3s;}" +
            ".pcart-fab:hover{transform:translateY(-4px) scale(1.05);}" +
            "@keyframes pcartPulse{0%{transform:scale(1);}30%{transform:scale(1.18);}60%{transform:scale(.95);}100%{transform:scale(1);}}" +
            ".pcart-fab-pulse{animation:pcartPulse .5s ease;}" +
            ".pcart-badge{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 5px;border-radius:50%;" +
            "background:#111;color:#ff9d00;font-size:12px;font-weight:800;display:none;align-items:center;justify-content:center;" +
            "border:2px solid #ff8a00;font-family:'Vazirmatn',sans-serif;}" +
            ".pcart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(2px);opacity:0;pointer-events:none;" +
            "transition:opacity .35s;z-index:99998;}" +
            ".pcart-overlay.pcart-open{opacity:1;pointer-events:auto;}" +
            ".pcart-drawer{position:fixed;top:0;right:0;height:100%;width:400px;max-width:92vw;background:#0d0d0d;" +
            "border-left:1px solid rgba(255,140,0,.2);box-shadow:-10px 0 40px rgba(0,0,0,.5);transform:translateX(100%);" +
            "transition:transform .4s cubic-bezier(.4,0,.2,1);z-index:99999;display:flex;flex-direction:column;" +
            "font-family:'Vazirmatn',sans-serif;color:#fff;direction:rtl;}" +
            ".pcart-drawer.pcart-open{transform:translateX(0);}" +
            ".pcart-head{display:flex;align-items:center;justify-content:space-between;padding:22px 22px 18px;" +
            "border-bottom:1px solid rgba(255,140,0,.15);}" +
            ".pcart-head h3{font-size:19px;font-weight:800;display:flex;align-items:center;gap:10px;}" +
            ".pcart-head h3 i{color:#ff8a00;}" +
            ".pcart-close{background:transparent;border:1px solid rgba(255,140,0,.3);color:#fff;width:36px;height:36px;" +
            "border-radius:10px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;}" +
            ".pcart-close:hover{background:rgba(255,140,0,.12);}" +
            ".pcart-body{flex:1;overflow-y:auto;padding:16px 18px;}" +
            ".pcart-empty{text-align:center;padding:70px 15px;color:#999;}" +
            ".pcart-empty i{font-size:46px;color:#ff8a0055;margin-bottom:16px;display:block;}" +
            ".pcart-item{display:flex;justify-content:space-between;gap:12px;background:rgba(255,255,255,.04);" +
            "border:1px solid rgba(255,140,0,.12);border-radius:16px;padding:14px 16px;margin-bottom:12px;}" +
            ".pcart-item-name{font-weight:700;font-size:14.5px;margin-bottom:4px;}" +
            ".pcart-item-sub{font-size:12px;color:#aaa;margin-bottom:10px;}" +
            ".pcart-item-qty{display:flex;align-items:center;gap:10px;}" +
            ".pcart-qty-btn{width:26px;height:26px;border-radius:8px;border:1px solid rgba(255,140,0,.35);" +
            "background:#161616;color:#fff;cursor:pointer;font-size:15px;line-height:1;}" +
            ".pcart-qty-btn:hover{background:#ff7a00;color:#111;}" +
            ".pcart-qty-val{font-size:13px;font-weight:700;min-width:18px;text-align:center;}" +
            ".pcart-item-side{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;}" +
            ".pcart-item-price{font-size:13.5px;font-weight:800;color:#ff9d00;white-space:nowrap;}" +
            ".pcart-remove-btn{background:transparent;border:none;color:#ff5c5c;cursor:pointer;font-size:15px;padding:6px;}" +
            ".pcart-footer{border-top:1px solid rgba(255,140,0,.15);padding:18px 20px 22px;}" +
            ".pcart-total-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;font-size:15px;}" +
            ".pcart-total-row b{color:#ff9d00;font-size:19px;}" +
            ".pcart-actions{display:flex;flex-direction:column;gap:10px;}" +
            ".pcart-checkout-btn{width:100%;padding:14px;border-radius:14px;border:none;cursor:pointer;font-weight:800;" +
            "font-size:15px;background:linear-gradient(135deg,#ff6a00,#ff9d00);color:#111;font-family:'Vazirmatn',sans-serif;" +
            "display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 0 25px rgba(255,120,0,.4);}" +
            ".pcart-clear-btn{width:100%;padding:11px;border-radius:14px;border:1px solid rgba(255,80,80,.35);" +
            "background:transparent;color:#ff8888;cursor:pointer;font-size:13px;font-family:'Vazirmatn',sans-serif;}" +
            ".pcart-toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%) translateY(20px);" +
            "background:#161616;border:1px solid rgba(255,140,0,.4);color:#fff;padding:12px 22px;border-radius:50px;" +
            "font-family:'Vazirmatn',sans-serif;font-size:13.5px;z-index:100000;opacity:0;pointer-events:none;" +
            "transition:opacity .3s, transform .3s;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.4);}" +
            ".pcart-toast-show{opacity:1;transform:translateX(-50%) translateY(0);}" +
            "@media (max-width:600px){.pcart-fab{width:54px;height:54px;bottom:18px;left:18px;font-size:20px;}" +
            ".pcart-head{padding:18px 16px 14px;}.pcart-body{padding:12px 14px;}.pcart-footer{padding:14px 16px 18px;}" +
            ".pcart-toast{font-size:12.5px;padding:10px 18px;bottom:85px;}}";
css +=
".pmodal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:none;align-items:center;justify-content:center;z-index:100001;}" +
".pmodal-overlay.active{display:flex;}" +
".pmodal-box{width:90%;max-width:400px;background:#111;border:1px solid rgba(255,140,0,.4);border-radius:20px;padding:25px;text-align:center;color:#fff;font-family:'Vazirmatn',sans-serif;}" +
".pmodal-box h3{font-size:18px;margin-bottom:20px;}" +
".pmodal-box input{width:100%;box-sizing:border-box;padding:13px;border-radius:12px;background:#222;border:1px solid #444;color:#fff;margin-bottom:15px;}" +
".pmodal-box textarea{width:100%;box-sizing:border-box;padding:13px;border-radius:12px;background:#222;border:1px solid #444;color:#fff;margin-bottom:15px;min-height:100px;resize:none;font-family:'Vazirmatn',sans-serif;}" +
".pmodal-box textarea::placeholder{color:#888;}" +
".pmodal-box button{width:100%;padding:12px;border-radius:12px;border:none;margin-top:8px;background:#ff8500;color:#111;font-weight:800;cursor:pointer;}";
        var styleTag = document.createElement("style");
        styleTag.id = "pcartStyles";
        styleTag.textContent = css;
        document.head.appendChild(styleTag);
    }

    function injectMarkup() {
        var wrap = document.createElement("div");
        wrap.innerHTML =
            '<button type="button" id="pcartFab" class="pcart-fab" aria-label="سبد خرید">' +
            '<i class="fa-solid fa-cart-shopping"></i>' +
            '<span id="pcartBadge" class="pcart-badge">0</span>' +
            "</button>" +
            '<div id="pcartOverlay" class="pcart-overlay"></div>' +
            '<div id="pcartDrawer" class="pcart-drawer">' +
            '<div class="pcart-head">' +
            "<h3><i class=\"fa-solid fa-cart-shopping\"></i> سبد خرید</h3>" +
            '<button type="button" class="pcart-close" id="pcartCloseBtn"><i class="fa-solid fa-xmark"></i></button>' +
            "</div>" +
            '<div class="pcart-body" id="pcartBody"></div>' +
            '<div class="pcart-footer" id="pcartFooter" style="display:none;">' +
            '<div class="pcart-total-row"><span>جمع کل سبد خرید:</span><b id="pcartTotal">0 تومان</b></div>' +
            '<div class="pcart-actions">' +
            '<button type="button" class="pcart-checkout-btn" id="pcartCheckoutBtn">' +
            '<i class="fa-brands fa-telegram"></i> پرداخت و ثبت سفارش</button>' +
            '<button type="button" class="pcart-clear-btn" id="pcartClearBtn">خالی کردن سبد خرید</button>' +
            "</div>" +
            "</div>" +
            "</div>" +
            '<div id="pcartToast" class="pcart-toast"></div>'+
'<div id="pmodalOverlay" class="pmodal-overlay">' +
'<div class="pmodal-box">' +
'<h3 id="pmodalTitle">اطلاعات سفارش</h3>' +
'<input id="pmodalInput" type="text" placeholder="آیدی گیرنده گیفت">' +
'<textarea id="pmodalText" placeholder="متن دلخواه زیر گیفت"></textarea>' +
'<button id="pmodalSubmit">تایید</button>' +
'<button id="pmodalCancel">لغو</button>' +
'</div>' +
'</div>';
        while (wrap.firstChild) {
            document.body.appendChild(wrap.firstChild);
        }

        document.getElementById("pcartFab").addEventListener("click", function () {
            renderDrawer();
            openDrawer();
        });
        document.getElementById("pcartOverlay").addEventListener("click", closeDrawer);
        document.getElementById("pcartCloseBtn").addEventListener("click", closeDrawer);
        document.getElementById("pcartCheckoutBtn").addEventListener("click", window.psychoCheckout);
        document.getElementById("pcartClearBtn").addEventListener("click", function () {
            if (confirm("سبد خرید خالی شود؟")) {
                window.psychoClearCart();
            }
        });
    }

    function init() {
        injectStyles();
        injectMarkup();
        updateBadge();
        renderDrawer();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
