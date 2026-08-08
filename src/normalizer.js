const ratingMap = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5
};

export function normalizeBook(record) {
  const price_gbp = Number.parseFloat(
    record.price_text.replace("£", "")
  );

  const rating = ratingMap[record.rating_text] ?? null;

  return {
    ...record,
    price_gbp,
    rating
  };
}