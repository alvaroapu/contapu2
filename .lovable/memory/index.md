CRM Editorial Apuleyo Ediciones - design system, architecture, and key decisions

## Design System
- Primary: azul oscuro (#1b2330) → HSL 216 28% 14%
- Accent: naranja (#ea5d3f) → HSL 12 80% 58%
- Background: blanco/gris claro
- Sidebar: dark (primary color background), orange accent for active items
- Currency format: European (1.234,56 €) via `formatCurrency()` in `src/lib/format.ts`
- Language: Spanish (UI labels, toasts, placeholders)

## Architecture
- Auth: Supabase email/password, no public registration
- Auth guard: `RequireAuth` component wraps protected routes
- Layout: `AppLayout` with sidebar navigation
- Supabase project ref: eabgdxhmfyuioblanysb

## Database Tables
- distributors, books, import_batches, sales_movements, liquidations, liquidation_items
- Views: book_inventory_summary, book_inventory_annual
- Functions: normalize_text(), get_sales_page(), match_book_by_normalized_title()
- Dashboard RPCs: get_dashboard_summary(), get_monthly_sales_summary(), get_top_books(), get_top_authors()
- Liquidation RPC: get_liquidation_items_page()
- RLS: authenticated users full access on all tables

## Key Modules
- Dashboard (/): KPI cards, monthly bar chart, line chart, top books/authors
- Catálogo (/catalogo): CRUD + CSV/XLSX import
- Ventas (/ventas): grouped table by book/distributor, inline editing, export Excel
- Importar (/importar): Azeta (ISBN matching) + Maidhisa (ref + title matching), result screen with assign/ignore
- Liquidaciones (/liquidaciones): list, create, detail with inline editing, PDF per author, ZIP all PDFs, Excel export

## Implementation Complete
- PART 1: DB schema, auth, sidebar, book catalog
- PART 2: Sales accounting, distributor report import
- PART 3: Author liquidations (royalties, PDF, Excel), Dashboard with charts
