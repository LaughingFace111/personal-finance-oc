import { useMemo, useState } from 'react';

export interface TagOption {
  id: string;
  name: string;
  color?: string;
  parent_id?: string;
  is_active?: boolean;
}

/**
 * 标准标签选择器组件
 * 支持单选、Form.Item 受控模式
 */
export function TagSelector({
  tags,
  value,
  onChange,
  placeholder = '点击选择标签',
  allowClear = true,
}: {
  tags: TagOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  // 过滤有效标签（排除已删除或停用的）
  const validTags = useMemo(
    () => tags.filter((t) => t.is_active !== false),
    [tags]
  );

  // 获取选中标签的显示名称
  const selectedLabel = useMemo(() => {
    if (!value) return '';
    const tag = validTags.find((t) => t.id === value);
    return tag?.name || '';
  }, [value, validTags]);

  return (
    <>
      <div
        onClick={() => setModalOpen(true)}
        className="flex h-11 cursor-pointer items-center justify-between rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition hover:brightness-95"
        style={{
          color: selectedLabel ? 'var(--text-primary)' : 'var(--text-tertiary)',
        }}
      >
        {selectedLabel || placeholder}
        {allowClear && value && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="ml-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            ×
          </span>
        )}
      </div>

      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: modalOpen ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={() => setModalOpen(false)}
      >
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 16,
            width: 320,
            maxHeight: '80vh',
            overflow: 'auto',
            padding: 16,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 600, marginBottom: 12 }}>选择标签</div>
          {validTags.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>
              暂无可选标签
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {validTags.map((tag) => (
                <div
                  key={tag.id}
                  onClick={() => {
                    onChange(tag.id);
                    setModalOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: value === tag.id ? 'var(--bg-elevated)' : 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      value === tag.id ? 'var(--bg-elevated)' : 'transparent')
                  }
                >
                  {tag.color && (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: tag.color,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span>{tag.name}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button
              onClick={() => setModalOpen(false)}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
