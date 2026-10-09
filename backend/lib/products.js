export const CURRENCY = "GHS";
export const TAX_RATE = 0.075;
export const SHIPPING_CENTS = 500;

export const products = [
  {
    id: "mug",
    name: "Stoneware Mug",
    description:
      "Hand-glazed 350 ml mug that keeps your coffee warm through the morning stand-up.",
    image: "/img/mug.svg",
    price: 800,
    currency: CURRENCY,
  },
  {
    id: "tote",
    name: "Canvas Tote Bag",
    description:
      "Heavyweight cotton tote with an inner pocket. Carries a laptop and lunch.",
    image: "/img/tote.svg",
    price: 900,
    currency: CURRENCY,
  },
  {
    id: "notebook",
    name: "Dot-Grid Notebook",
    description:
      "A5, 160 pages of 100 gsm paper. Lies flat, takes fountain pens well.",
    image: "/img/notebook.svg",
    price: 600,
    currency: CURRENCY,
  },
  {
    id: "plant",
    name: "Desk Succulent",
    description:
      "Low-maintenance succulent in a 9 cm terracotta pot. Water every two weeks.",
    image: "/img/plant.svg",
    price: 500,
    currency: CURRENCY,
  },
  {
    id: "bottle",
    name: "Insulated Bottle",
    description: "Double-walled steel, 750 ml. Cold for 24 hours, hot for 12.",
    image: "/img/bottle.svg",
    price: 400,
    currency: CURRENCY,
  },
  {
    id: "headphones",
    name: "Studio Headphones",
    description:
      "Closed-back over-ear headphones with a detachable 3.5 mm cable.",
    image: "/img/headphones.svg",
    price: 900,
    currency: CURRENCY,
  },
];

export const findProduct = (id) => products.find((p) => p.id === id);
