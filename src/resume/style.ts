export type FontId =
  | "misans"
  | "yahei"
  | "noto"
  | "dengxian"
  | "simsun"
  | "system";

export type PhotoShape = "square" | "rounded" | "circle";

export interface StyleConfig {
  /** 正文字号，pt */
  bodySize: number;
  /** 行高倍数 */
  lineHeight: number;
  /** 项目标题字号，pt（姓名与大节标题按比例联动） */
  headingSize: number;
  /** 页边距，mm */
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** 大节之间的间距，pt */
  sectionGap: number;
  fontFamily: FontId;
  themeColor: string;
  showSectionRules: boolean;
  showPhoto: boolean;
  /**
   * 自定义证件照（压缩后的 data URL）。
   * null 表示使用工作区参考 PDF 中提取的默认照片。
   */
  photoDataUrl: string | null;
  /** 照片左上角在 A4 页面中的位置，mm */
  photoX: number;
  photoY: number;
  /** 照片显示尺寸，mm */
  photoWidth: number;
  photoHeight: number;
  photoShape: PhotoShape;
}

export const FONT_STACKS: Record<FontId, string> = {
  misans: '"MiSans", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  yahei: '"Microsoft YaHei", "MiSans", "Noto Sans SC", sans-serif',
  noto: '"Noto Sans SC", "MiSans", "Microsoft YaHei", sans-serif',
  dengxian: '"DengXian", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  simsun: '"SimSun", "Songti SC", "Noto Serif SC", serif',
  system:
    'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "Noto Sans SC", sans-serif',
};

export const FONT_OPTIONS: Array<{ id: FontId; label: string; note?: string }> = [
  { id: "misans", label: "MiSans", note: "接近原稿" },
  { id: "yahei", label: "微软雅黑" },
  { id: "noto", label: "Noto Sans SC" },
  { id: "dengxian", label: "等线 DengXian" },
  { id: "simsun", label: "宋体 SimSun" },
  { id: "system", label: "系统无衬线" },
];

export const DEFAULT_STYLE: StyleConfig = {
  bodySize: 9.75,
  lineHeight: 1.54,
  headingSize: 12.75,
  marginTop: 6.1,
  marginBottom: 10.6,
  marginLeft: 10.6,
  marginRight: 10.6,
  sectionGap: 9,
  fontFamily: "misans",
  themeColor: "#111111",
  showSectionRules: true,
  showPhoto: true,
  photoDataUrl: null,
  photoX: 175.3,
  photoY: 6.1,
  photoWidth: 22,
  photoHeight: 27,
  photoShape: "square",
};

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

/** data URL 字符串长度上限（约 1.1 MB 二进制），避免挤占 localStorage。 */
export const MAX_PHOTO_DATA_URL = 1_500_000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const round = (value: number, step: number): number =>
  Number((Math.round(value / step) * step).toFixed(6));

export function normalizeStyle(input: unknown): StyleConfig {
  const source =
    input && typeof input === "object" ? (input as Partial<StyleConfig>) : {};
  const fontFamily = FONT_OPTIONS.some((f) => f.id === source.fontFamily)
    ? (source.fontFamily as FontId)
    : DEFAULT_STYLE.fontFamily;
  const color =
    typeof source.themeColor === "string" &&
    /^#[0-9a-f]{6}$/i.test(source.themeColor)
      ? source.themeColor.toLowerCase()
      : DEFAULT_STYLE.themeColor;

  const num = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  const photoWidth = round(
    clamp(num(source.photoWidth, DEFAULT_STYLE.photoWidth), 5, 120),
    0.5,
  );
  const photoHeight = round(
    clamp(num(source.photoHeight, DEFAULT_STYLE.photoHeight), 5, 160),
    0.5,
  );
  const photoX = round(
    clamp(
      num(source.photoX, DEFAULT_STYLE.photoX),
      0,
      PAGE_WIDTH_MM - photoWidth,
    ),
    0.1,
  );
  const photoY = round(
    clamp(
      num(source.photoY, DEFAULT_STYLE.photoY),
      0,
      PAGE_HEIGHT_MM - photoHeight,
    ),
    0.1,
  );
  const photoShape: PhotoShape =
    source.photoShape === "rounded" || source.photoShape === "circle"
      ? source.photoShape
      : "square";
  const photoDataUrl =
    typeof source.photoDataUrl === "string" &&
    source.photoDataUrl.length <= MAX_PHOTO_DATA_URL &&
    /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(
      source.photoDataUrl,
    )
      ? source.photoDataUrl
      : null;

  return {
    bodySize: round(clamp(num(source.bodySize, DEFAULT_STYLE.bodySize), 7.5, 14), 0.25),
    lineHeight: round(
      clamp(num(source.lineHeight, DEFAULT_STYLE.lineHeight), 1.15, 2.2),
      0.01,
    ),
    headingSize: round(
      clamp(num(source.headingSize, DEFAULT_STYLE.headingSize), 9.5, 22),
      0.25,
    ),
    marginTop: round(
      clamp(num(source.marginTop, DEFAULT_STYLE.marginTop), 0, 40),
      0.1,
    ),
    marginBottom: round(
      clamp(num(source.marginBottom, DEFAULT_STYLE.marginBottom), 0, 40),
      0.1,
    ),
    marginLeft: round(
      clamp(num(source.marginLeft, DEFAULT_STYLE.marginLeft), 0, 40),
      0.1,
    ),
    marginRight: round(
      clamp(num(source.marginRight, DEFAULT_STYLE.marginRight), 0, 40),
      0.1,
    ),
    sectionGap: round(
      clamp(num(source.sectionGap, DEFAULT_STYLE.sectionGap), 0, 40),
      0.5,
    ),
    fontFamily,
    themeColor: color,
    showSectionRules:
      typeof source.showSectionRules === "boolean"
        ? source.showSectionRules
        : DEFAULT_STYLE.showSectionRules,
    showPhoto:
      typeof source.showPhoto === "boolean"
        ? source.showPhoto
        : DEFAULT_STYLE.showPhoto,
    photoDataUrl,
    photoX,
    photoY,
    photoWidth,
    photoHeight,
    photoShape,
  };
}

export type CssVars = Record<string, string>;

export function styleToCssVars(style: StyleConfig): CssVars {
  return {
    "--r-body": `${style.bodySize}pt`,
    "--r-line": String(style.lineHeight),
    "--r-heading": `${style.headingSize}pt`,
    "--r-mt": `${style.marginTop}mm`,
    "--r-mb": `${style.marginBottom}mm`,
    "--r-ml": `${style.marginLeft}mm`,
    "--r-mr": `${style.marginRight}mm`,
    "--r-section-gap": `${style.sectionGap}pt`,
    "--r-font": FONT_STACKS[style.fontFamily],
    "--r-theme": style.themeColor,
    "--r-photo-x": `${style.photoX}mm`,
    "--r-photo-y": `${style.photoY}mm`,
    "--r-photo-w": `${style.photoWidth}mm`,
    "--r-photo-h": `${style.photoHeight}mm`,
    "--r-photo-radius":
      style.photoShape === "circle"
        ? "50%"
        : style.photoShape === "rounded"
          ? "2mm"
          : "0",
  };
}

/** CSS px per mm at 96dpi, the unit browsers use for CSS lengths. */
export const PX_PER_MM = 96 / 25.4;

export function pageContentWidthPx(style: StyleConfig): number {
  return (PAGE_WIDTH_MM - style.marginLeft - style.marginRight) * PX_PER_MM;
}

export function pageContentHeightPx(style: StyleConfig): number {
  return (PAGE_HEIGHT_MM - style.marginTop - style.marginBottom) * PX_PER_MM;
}
