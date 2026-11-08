// A real button that opens a file chooser (the native file input looks out of place).
export default function FilePicker({ label, accept, onFile }) {
  return (
    <label className="g-btn g-file">
      {label}
      <input type="file" accept={accept} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
    </label>
  )
}
