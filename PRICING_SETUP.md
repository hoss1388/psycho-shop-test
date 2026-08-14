# راهنمای فعال‌سازی قیمت آنلاین Premium

## Secret لازم

فقط Secret زیر را در GitHub اضافه کنید:

| نام | کاربرد |
|---|---|
| `FRAGMENT_API_KEY` | کلید Merchant API سرویس `fragment-api.io` برای دریافت quoteهای Premium و فهرست قیمت. |

مسیر افزودن Secret در مخزن GitHub عبارت است از: **Settings → Secrets and variables → Actions → New repository secret**. کلید را فقط در همین محل وارد کنید؛ آن را در کد، فایل JSON، تنظیمات سایت یا پیام‌های commit قرار ندهید.

## اجرای دستی و معیار موفقیت

پس از افزودن Secret، به **Actions → Update Live Premium Prices → Run workflow** بروید. برای آزمون بدون تغییر مخزن، گزینه **dry_run** را فعال کنید؛ این اجرا هر دو API زنده را می‌خواند و validation را اجرا می‌کند اما commit نمی‌سازد. برای به‌روزرسانی واقعی، `dry_run` را غیرفعال کنید. اجرای موفق باید همه stepها را سبز نشان دهد، مرحله **Validate generated prices and health** خروجی JSON با `"valid": true` داشته باشد و در اجرای غیرآزمایشی commit جدیدی با عنوان `chore(pricing): refresh live Fragment Premium quotes` ثبت کند؛ مگر آنکه قیمت‌ها واقعاً تغییری نکرده باشند.

فایل `api/prices.json` پس از موفقیت شامل `updatedAt`، وضعیت `health.status: "ok"`، نرخ معتبر `tonToToman` و quoteهای TON برای ۳، ۶ و ۱۲ ماه خواهد بود. اگر Fragment، Bitpin یا اعتبارسنجی خطا بدهد، Workflow قبل از commit متوقف می‌شود و سایت به‌جای قیمت قدیمی پیام «قیمت آنلاین موقتاً در دسترس نیست» نمایش می‌دهد.

## تناوب به‌روزرسانی

Workflow هر ۵ دقیقه زمان‌بندی شده است و صفحه سایت نیز `prices.json` را هر ۳ دقیقه یک‌بار بازخوانی می‌کند. بنابراین پس از اجرای موفق Workflow، قیمت سایت معمولاً حداکثر تا حدود ۸ دقیقه بعد به‌روز می‌شود؛ زمان صف GitHub Actions و انتشار فایل می‌تواند این زمان را افزایش دهد.

## Health check محلی

برای بررسی آخرین فایل تولیدشده، از دستور زیر در ریشه پروژه استفاده کنید:

```bash
MAX_PRICE_AGE_SECONDS=900 node scripts/validate-prices.cjs api/prices.json
```

خروجی شامل زمان آخرین دریافت موفق، سن داده، وضعیت Fragment، وضعیت نرخ TON و نتیجه هر validation است. کد خروجی صفر یعنی داده معتبر و تازه است؛ کد خروجی غیرصفر یعنی فایل برای نمایش قیمت آنلاین قابل اعتماد نیست.
