/**
 * Rich text field (TipTap). Submits HTML under `name` through a hidden input, so it works inside the
 * normal server forms. The server sanitizes whatever arrives (src/server/html.ts).
 */
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading, Italic, Link2, List, ListOrdered, Quote, Redo2, Underline, Undo2 } from "lucide-react";
import { useState, type ReactNode } from "react";

interface Props {
  name: string;
  value?: string | null;
  placeholder?: string;
  /** Height of the writing area, in rem. */
  minHeight?: number;
  ariaLabel?: string;
}

export default function RichTextEditor({ name, value, placeholder = "Write here…", minHeight = 8, ariaLabel }: Props) {
  const [html, setHtml] = useState(value ?? "");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "fm-prose focus:outline-none px-3 py-2.5",
        style: `min-height:${minHeight}rem`,
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => setHtml(e.isEmpty ? "" : e.getHTML()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            heading: e.isActive("heading", { level: 3 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  const chain = () => editor!.chain().focus();
  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "" || url === "https://") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="fm-editor rounded-lg border border-stone-300 bg-white shadow-sm focus-within:border-stone-500 focus-within:ring-2 focus-within:ring-stone-200">
      <input type="hidden" name={name} value={html} />
      <div
        className="flex items-center gap-0.5 overflow-x-auto border-b border-stone-200 px-1.5 py-1"
        role="toolbar"
        aria-label="Formatting"
      >
        <Tool label="Bold" active={state?.bold} onClick={() => chain().toggleBold().run()}>
          <Bold size={16} />
        </Tool>
        <Tool label="Italic" active={state?.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic size={16} />
        </Tool>
        <Tool label="Underline" active={state?.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline size={16} />
        </Tool>
        <Sep />
        <Tool label="Heading" active={state?.heading} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading size={16} />
        </Tool>
        <Tool label="Bulleted list" active={state?.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List size={16} />
        </Tool>
        <Tool label="Numbered list" active={state?.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </Tool>
        <Tool label="Quote" active={state?.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote size={16} />
        </Tool>
        <Tool label="Link" active={state?.link} onClick={setLink}>
          <Link2 size={16} />
        </Tool>
        <span className="ml-auto flex">
          <Tool label="Undo" disabled={!state?.canUndo} onClick={() => chain().undo().run()}>
            <Undo2 size={16} />
          </Tool>
          <Tool label="Redo" disabled={!state?.canRedo} onClick={() => chain().redo().run()}>
            <Redo2 size={16} />
          </Tool>
        </span>
      </div>
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="fm-prose px-3 py-2.5 text-stone-400" style={{ minHeight: `${minHeight}rem` }}>
          {placeholder}
        </div>
      )}
    </div>
  );
}

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean | undefined;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
        active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      } disabled:cursor-not-allowed disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px bg-stone-200" aria-hidden="true" />;
