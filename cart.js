let cart = JSON.parse(localStorage.getItem("psycho_cart")) || [];

function saveCart() {
    localStorage.setItem("psycho_cart", JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {

    const badge = document.getElementById("cart-count");

    if (!badge) return;

    if (cart.length === 0) {

        badge.style.display = "none";

    } else {

        badge.style.display = "inline-flex";

        badge.innerText = cart.length;

    }

}

function addToCart(item){

    cart.push(item);

    saveCart();

    alert(" محصول به سبد خرید اضافه شد.");

}

document.addEventListener("DOMContentLoaded", updateCartBadge);