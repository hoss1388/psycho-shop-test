# راهنمای کوتاه فعال‌سازی قیمت آنلاین Premium

| مورد | راهنما |
|---|---|
| **نام Secret** | `FRAGMENT_API_KEY` |
| **مسیر افزودن Secret** | در مخزن GitHub: `Settings → Secrets and variables → Actions → New repository secret`؛ نام را `FRAGMENT_API_KEY` بگذارید و کلید Merchant API Fragment را وارد کنید. |
| **اجرای دستی Workflow** | `Actions → Update Live Premium Prices → Run workflow`؛ برای آزمون بدون commit، گزینه `dry_run` را فعال کنید. برای ثبت قیمت‌های تازه در `api/prices.json`، آن را غیرفعال بگذارید. |
| **تشخیص موفقیت** | همه stepها باید سبز باشند و step `Validate generated prices and health` در خروجی خود `"valid": true` نشان دهد. در اجرای غیرآزمایشی، `api/prices.json` باید `updatedAt` تازه و `health.status: "ok"` داشته باشد. |
| **حداکثر زمان به‌روزرسانی سایت** | Workflow هر ۵ دقیقه اجرا می‌شود و سایت هر ۳ دقیقه فایل قیمت را بازخوانی می‌کند؛ بنابراین پس از اجرای موفق Workflow، معمولاً حداکثر حدود ۸ دقیقه زمان لازم است. زمان صف GitHub Actions یا انتشار فایل ممکن است این زمان را بیشتر کند. |
