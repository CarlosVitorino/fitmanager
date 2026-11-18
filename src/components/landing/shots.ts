/** Product screenshots for the home page, one set per language (scripts/landing-screenshots.cjs). */
import type { ImageMetadata } from "astro";
import { getLocale } from "../../i18n";

const files = import.meta.glob<{ default: ImageMetadata }>("../../assets/landing/*/*.webp", { eager: true });

export type Shot = "today" | "calendar" | "member" | "fitness" | "studio-page" | "phone-home" | "phone-book";

export function shot(name: Shot): ImageMetadata {
  const own = files[`../../assets/landing/${getLocale()}/${name}.webp`];
  return (own ?? files[`../../assets/landing/en/${name}.webp`]!).default;
}
