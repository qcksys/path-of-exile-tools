import { useSearchParams } from "react-router";
import { Input } from "~/components/ui/input";
import { ARBITRAGE_VOLUME_FILTERS } from "~/lib/arbitrage-volume-filters";

export function VolumeQueryFields() {
    const [params] = useSearchParams();
    return ARBITRAGE_VOLUME_FILTERS.map(({ key }) =>
        params.has(key) ? (
            <Input key={key} type="hidden" name={key} value={params.get(key) ?? ""} />
        ) : null,
    );
}
