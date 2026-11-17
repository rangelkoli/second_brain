// Expanding gaps: spaced retrieval beats massed review (Cepeda et al. 2006).
export const REVIEW_DAYS = [1, 3, 7, 21];
export function reviewDates(from: Date, days = REVIEW_DAYS) {
	return days.map((d) => {
		const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
		return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
	});
}
