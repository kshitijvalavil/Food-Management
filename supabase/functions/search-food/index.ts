// POST /search-food  { q }  ->  SearchFoodResponse   (thin wrapper over the search_food RPC)
import { SearchFoodRequest, SearchFoodResponse } from "../../../shared/schema.ts";
import { requireUser } from "../_shared/auth.ts";
import { defaultDeps, type Deps } from "../_shared/deps.ts";
import { searchFood } from "../_shared/enrich.ts";
import { HttpError } from "../_shared/errors.ts";
import { jsonHandler } from "../_shared/handler.ts";

export function createHandler(deps: Deps) {
  return jsonHandler("search-food", SearchFoodRequest, SearchFoodResponse, deps, async ({ req, body }) => {
    const { userClient } = await requireUser(req, deps);
    const q = body.q.trim();
    if (q.length === 0) throw new HttpError("bad_request", "Type something to search for.");
    let rows;
    try {
      rows = await searchFood(userClient, q);
    } catch (err) {
      console.error(`[search-food] ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpError("upstream_failed", "Search is unavailable right now.");
    }
    return {
      results: rows.slice(0, 10).map((r) => ({
        shelf_life_id: r.id,
        name: r.name,
        category: r.category,
        default_location: r.default_location,
      })),
    };
  });
}

if (import.meta.main) Deno.serve(createHandler(defaultDeps()));
