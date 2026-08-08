import { z } from "zod";

export const bookSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url().refine(
    (url) => url.startsWith("https://"),
    "URL must use HTTPS"
  ),
  price_text: z.string().min(1),
  price_gbp: z.number(),
  availability_text: z.string().min(1),
  rating_text: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  description: z.string().nullable(),
  source_page: z.string().url().refine(
    (url) => url.startsWith("https://"),
    "URL must use HTTPS"
  ),
  fetched_at: z.string().datetime()
});