import type { CSSProperties, Ref } from "react";
import { InlineMarkdown } from "./InlineMarkdown";
import type { ResumeBlock } from "./parser";
import { styleToCssVars, type StyleConfig } from "./style";

interface BlockViewProps {
  block: ResumeBlock;
  style: StyleConfig;
  photoSrc: string;
}

function Hero({ block, style, photoSrc }: BlockViewProps & { block: Extract<ResumeBlock, { kind: "hero" }> }) {
  const showPhoto = style.showPhoto && Boolean(photoSrc);
  return (
    <header className="r-hero" data-block-id={block.id} data-kind={block.kind}>
      <h1 className="r-name">
        <InlineMarkdown text={block.name} />
      </h1>
      {block.lines.map((line, index) => (
        <div
          className={`r-hero-line${index === 0 ? " r-hero-line--role" : ""}`}
          key={`${block.id}-line-${index}`}
        >
          <InlineMarkdown text={line} />
        </div>
      ))}
      {showPhoto ? (
        <img
          className="r-photo"
          src={photoSrc}
          alt="证件照"
          title="拖动调整照片位置"
          decoding="async"
          draggable={false}
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      ) : null}
    </header>
  );
}

export function ResumeBlockView({ block, style, photoSrc }: BlockViewProps) {
  switch (block.kind) {
    case "hero":
      return <Hero block={block} style={style} photoSrc={photoSrc} />;

    case "section":
      return (
        <div
          className="r-section"
          data-block-id={block.id}
          data-kind={block.kind}
        >
          <div className="r-section-tab">
            <span className="r-section-tab-text">
              <InlineMarkdown text={block.title} />
            </span>
            <span className="r-section-tab-tail" aria-hidden="true" />
          </div>
          {style.showSectionRules ? <div className="r-section-rule" /> : null}
        </div>
      );

    case "entry": {
      const count = Math.min(block.cells.length, 3);
      const gridClass =
        count >= 3
          ? "r-entry--3"
          : count === 2
            ? "r-entry--2"
            : "r-entry--1";
      return (
        <div
          className={`r-entry ${gridClass}${block.cells.length > 3 ? " r-entry--many" : ""}`}
          data-block-id={block.id}
          data-kind={block.kind}
        >
          {block.cells.map((cell, index) => (
            <div
              className={`r-entry-cell${
                index === block.cells.length - 1 ? " r-entry-cell--last" : ""
              }${index === 1 ? " r-entry-cell--middle" : ""}`}
              key={`${block.id}-cell-${index}`}
            >
              <InlineMarkdown text={cell} />
            </div>
          ))}
        </div>
      );
    }

    case "subheading":
      return (
        <h3
          className="r-project-title"
          data-block-id={block.id}
          data-kind={block.kind}
        >
          <InlineMarkdown text={block.text} />
        </h3>
      );

    case "paragraph":
      return (
        <p
          className={`r-para r-para--${block.variant}`}
          data-block-id={block.id}
          data-kind={block.kind}
        >
          <InlineMarkdown text={block.text} />
        </p>
      );

    case "list-item":
      return (
        <ul
          className="r-list"
          data-block-id={block.id}
          data-kind={block.kind}
        >
          <li>
            <InlineMarkdown text={block.text} />
          </li>
        </ul>
      );

    case "hr":
      return (
        <hr
          className="r-hr"
          data-block-id={block.id}
          data-kind={block.kind}
        />
      );
  }
}

interface ResumeFlowProps {
  blocks: ResumeBlock[];
  style: StyleConfig;
  photoSrc: string;
}

export function ResumeFlow({ blocks, style, photoSrc }: ResumeFlowProps) {
  return (
    <>
      {blocks.map((block) => (
        <ResumeBlockView
          key={block.id}
          block={block}
          style={style}
          photoSrc={photoSrc}
        />
      ))}
    </>
  );
}

interface ResumePagesProps {
  pages: ResumeBlock[][];
  style: StyleConfig;
  photoSrc: string;
  pagesRef?: Ref<HTMLDivElement>;
}

export function ResumePages({
  pages,
  style,
  photoSrc,
  pagesRef,
}: ResumePagesProps) {
  return (
    <div
      className="r-pages"
      ref={pagesRef}
      style={styleToCssVars(style) as CSSProperties}
    >
      {pages.map((blocks, index) => (
        <section className="r-page" key={index} data-page={index + 1}>
          <div className="r-page-inner">
            <ResumeFlow blocks={blocks} style={style} photoSrc={photoSrc} />
          </div>
        </section>
      ))}
    </div>
  );
}
