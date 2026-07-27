export interface SourceTextRange {
  start: number;
  end: number;
}

export interface SourceTextEdit extends SourceTextRange {
  replacementText: string;
}

/** 校验全部范围后倒序应用编辑；范围无效或相互重叠时返回 null。 */
export function applySourceTextEdits(
  sourceText: string,
  sourceTextEdits: readonly SourceTextEdit[],
): string | null {
  if (sourceTextEdits.length === 0) {
    return sourceText;
  }
  let previousEditEnd = 0;

  const ascendingEdits = [...sourceTextEdits].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );

  for (const sourceTextEdit of ascendingEdits) {
    const { start, end } = sourceTextEdit;
    const isSourceTextEditValid =
      [start, end].every(Number.isSafeInteger) &&
      start >= previousEditEnd &&
      end >= start &&
      end <= sourceText.length;

    if (!isSourceTextEditValid) {
      return null;
    }
    previousEditEnd = end;
  }
  let editedText = sourceText;

  for (const sourceTextEdit of ascendingEdits.reverse()) {
    editedText =
      editedText.slice(0, sourceTextEdit.start) +
      sourceTextEdit.replacementText +
      editedText.slice(sourceTextEdit.end);
  }
  return editedText;
}
