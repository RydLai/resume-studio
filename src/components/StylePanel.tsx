import { useEffect, useRef, useState } from "react";
import { PHOTO_ACCEPT, photoFileToDataUrl } from "../resume/photo";
import {
  FONT_OPTIONS,
  PAGE_HEIGHT_MM,
  PAGE_WIDTH_MM,
  TEMPLATE_OPTIONS,
  type StyleConfig,
} from "../resume/style";

interface StylePanelProps {
  open: boolean;
  style: StyleConfig;
  photoSrc: string;
  hasDefaultPhoto: boolean;
  onChange: (patch: Partial<StyleConfig>) => void;
  onReset: () => void;
  onClose: () => void;
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: RangeFieldProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {unit ? <span className="field-unit">{unit}</span> : null}
      </span>
      <span className="range-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          type="number"
          className="number-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number.parseFloat(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
      </span>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="margin-field">
      <span className="margin-label">{label}</span>
      <span className="margin-input-wrap">
        <input
          type="number"
          className="number-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number.parseFloat(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
        <span className="margin-unit">{unit}</span>
      </span>
    </label>
  );
}

function ThemeColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <div className="theme-row">
      <input
        type="color"
        className="color-input"
        value={value}
        aria-label="主题颜色"
        onChange={(event) => onChange(event.target.value)}
      />
      <input
        type="text"
        className="text-input color-text"
        value={text}
        maxLength={7}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => {
          if (!/^#[0-9a-f]{6}$/i.test(text)) setText(value);
        }}
      />
    </div>
  );
}

export function StylePanel({
  open,
  style,
  photoSrc,
  hasDefaultPhoto,
  onChange,
  onReset,
  onClose,
}: StylePanelProps) {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  const handlePhotoFile = async (file: File) => {
    setUploading(true);
    setPhotoError(null);
    try {
      const dataUrl = await photoFileToDataUrl(file);
      onChange({ photoDataUrl: dataUrl, showPhoto: true });
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "图片处理失败，请重试。",
      );
    } finally {
      setUploading(false);
    }
  };

  const resetPhotoPosition = () => {
    onChange({
      photoX: Math.round(
        (PAGE_WIDTH_MM -
          style.marginRight -
          2.1 -
          style.photoWidth) *
          10,
      ) / 10,
      photoY: style.marginTop,
    });
  };

  const thumbRadius =
    style.photoShape === "circle"
      ? "50%"
      : style.photoShape === "rounded"
        ? "4px"
        : "2px";

  return (
    <aside className="style-panel" aria-label="样式设置">
      <header className="style-panel-head">
        <div>
          <h2 className="style-panel-title">样式设置</h2>
          <p className="style-panel-subtitle">仅影响排版，不写入 Markdown</p>
        </div>
        <button
          type="button"
          className="icon-button close-button"
          onClick={onClose}
          aria-label="关闭样式设置"
          title="关闭"
        >
          ×
        </button>
      </header>

      <div className="style-panel-body">
        <section className="style-group">
          <h3 className="style-group-title">模板</h3>
          <div className="template-list" role="radiogroup" aria-label="简历模板">
            {TEMPLATE_OPTIONS.map((option) => {
              const active = style.template === option.id;
              return (
                <button
                  type="button"
                  key={option.id}
                  role="radio"
                  aria-checked={active}
                  className={`template-card${active ? " is-active" : ""}`}
                  onClick={() => onChange({ template: option.id })}
                >
                  <span
                    className={`template-thumb template-thumb--${option.id}`}
                    aria-hidden="true"
                  >
                    <span className="tt-header" />
                    <span className="tt-line tt-line--1" />
                    <span className="tt-line tt-line--2" />
                    <span className="tt-line tt-line--3" />
                  </span>
                  <span className="template-text">
                    <span className="template-name">{option.label}</span>
                    <span className="template-desc">{option.note}</span>
                  </span>
                  {active ? (
                    <span className="template-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="style-group">
          <h3 className="style-group-title">字体</h3>
          <label className="field">
            <span className="field-label">字体族</span>
            <select
              className="select-input"
              value={style.fontFamily}
              onChange={(event) =>
                onChange({
                  fontFamily: event.target.value as StyleConfig["fontFamily"],
                })
              }
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                  {font.note ? `（${font.note}）` : ""}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="style-group">
          <h3 className="style-group-title">文字</h3>
          <RangeField
            label="正文字号"
            value={style.bodySize}
            min={8}
            max={13}
            step={0.25}
            unit="pt"
            onChange={(bodySize) => onChange({ bodySize })}
          />
          <RangeField
            label="行高"
            value={style.lineHeight}
            min={1.2}
            max={2}
            step={0.01}
            onChange={(lineHeight) => onChange({ lineHeight })}
          />
          <RangeField
            label="项目标题字号"
            value={style.headingSize}
            min={10}
            max={20}
            step={0.25}
            unit="pt"
            onChange={(headingSize) => onChange({ headingSize })}
          />
          <p className="field-hint">
            姓名会跟随项目标题字号等比缩放；大节标签跟随正文字号。
          </p>
        </section>

        <section className="style-group">
          <h3 className="style-group-title">页面边距</h3>
          <div className="margin-grid">
            <NumberField
              label="上"
              value={style.marginTop}
              min={0}
              max={40}
              step={0.1}
              unit="mm"
              onChange={(marginTop) => onChange({ marginTop })}
            />
            <NumberField
              label="下"
              value={style.marginBottom}
              min={0}
              max={40}
              step={0.1}
              unit="mm"
              onChange={(marginBottom) => onChange({ marginBottom })}
            />
            <NumberField
              label="左"
              value={style.marginLeft}
              min={0}
              max={40}
              step={0.1}
              unit="mm"
              onChange={(marginLeft) => onChange({ marginLeft })}
            />
            <NumberField
              label="右"
              value={style.marginRight}
              min={0}
              max={40}
              step={0.1}
              unit="mm"
              onChange={(marginRight) => onChange({ marginRight })}
            />
          </div>
        </section>

        <section className="style-group">
          <h3 className="style-group-title">间距</h3>
          <RangeField
            label="模块间距"
            value={style.sectionGap}
            min={0}
            max={30}
            step={0.5}
            unit="pt"
            onChange={(sectionGap) => onChange({ sectionGap })}
          />
        </section>

        <section className="style-group">
          <h3 className="style-group-title">照片</h3>
          <div className="photo-editor">
            <div
              className={`photo-thumb-wrap${style.showPhoto ? "" : " is-hidden"}`}
            >
              {photoSrc ? (
                <img
                  className="photo-thumb"
                  src={photoSrc}
                  alt="当前证件照"
                  style={{ borderRadius: thumbRadius }}
                />
              ) : (
                <span className="photo-empty">无照片</span>
              )}
            </div>
            <div className="photo-actions">
              <button
                type="button"
                className="button ghost photo-action"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? "处理中…"
                  : style.photoDataUrl
                    ? "更换照片…"
                    : "上传照片…"}
              </button>
              {style.photoDataUrl ? (
                hasDefaultPhoto ? (
                  <button
                    type="button"
                    className="button ghost photo-action"
                    onClick={() =>
                      onChange({ photoDataUrl: null, showPhoto: true })
                    }
                  >
                    恢复默认照片
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button ghost photo-action"
                    onClick={() =>
                      onChange({ photoDataUrl: null, showPhoto: false })
                    }
                  >
                    移除照片
                  </button>
                )
              ) : null}
              <span className="photo-hint">
                PNG / JPEG / WebP
                <br />
                自动压缩，最长边 900px
              </span>
            </div>
          </div>

          <input
            ref={photoInputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handlePhotoFile(file);
            }}
          />

          {photoError ? (
            <p className="form-error photo-error">{photoError}</p>
          ) : null}

          <div className="margin-grid photo-grid">
            <NumberField
              label="宽"
              value={style.photoWidth}
              min={5}
              max={120}
              step={0.5}
              unit="mm"
              onChange={(photoWidth) => onChange({ photoWidth })}
            />
            <NumberField
              label="高"
              value={style.photoHeight}
              min={5}
              max={160}
              step={0.5}
              unit="mm"
              onChange={(photoHeight) => onChange({ photoHeight })}
            />
            <NumberField
              label="X"
              value={style.photoX}
              min={0}
              max={PAGE_WIDTH_MM}
              step={0.1}
              unit="mm"
              onChange={(photoX) => onChange({ photoX })}
            />
            <NumberField
              label="Y"
              value={style.photoY}
              min={0}
              max={PAGE_HEIGHT_MM}
              step={0.1}
              unit="mm"
              onChange={(photoY) => onChange({ photoY })}
            />
          </div>

          <div className="photo-buttons">
            <button
              type="button"
              className="button ghost photo-action"
              onClick={resetPhotoPosition}
            >
              复位到右上
            </button>
            <span className="photo-hint">
              也可直接在右侧预览中拖动照片
            </span>
          </div>

          <label className="field photo-shape-field">
            <span className="field-label">形状</span>
            <select
              className="select-input"
              value={style.photoShape}
              onChange={(event) =>
                onChange({
                  photoShape: event.target.value as StyleConfig["photoShape"],
                })
              }
            >
              <option value="square">直角</option>
              <option value="rounded">圆角</option>
              <option value="circle">圆形 / 椭圆</option>
            </select>
          </label>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={style.showPhoto}
              onChange={(event) =>
                onChange({ showPhoto: event.target.checked })
              }
            />
            <span>显示照片</span>
          </label>
        </section>

        <section className="style-group">
          <h3 className="style-group-title">外观</h3>
          <span className="field-label">主题颜色</span>
          <ThemeColorField
            value={style.themeColor}
            onChange={(themeColor) => onChange({ themeColor })}
          />
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={style.showSectionRules}
              onChange={(event) =>
                onChange({ showSectionRules: event.target.checked })
              }
            />
            <span>显示模块分隔线</span>
          </label>
        </section>

        <p className="style-note">
          默认字体与间距来自参考稿。若所选字体未安装，将自动回退到系统
          无衬线字体。
        </p>
      </div>

      <footer className="style-panel-foot">
        <button type="button" className="button ghost" onClick={onReset}>
          恢复默认样式
        </button>
      </footer>
    </aside>
  );
}
