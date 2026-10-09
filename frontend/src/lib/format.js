export function formatMoney(cents, currency = "GHS") {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
  }).format(cents / 100);
}
// export function formatMoney(cents, currency = 'USD') {
//   return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
// }
