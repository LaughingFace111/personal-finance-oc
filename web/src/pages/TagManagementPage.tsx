import { DeleteOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Input, message, Modal, Select, Spin, Tabs, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildGroups, hexToRgba } from '../components/TagMultiSelect';
import { useAuth } from '../contexts/AuthContext';
import { apiDelete, apiGet, apiPatch, apiPost } from '../services/api';

type TagItem = {
  id: string;
  name: string;
  color?: string;
  parent_id?: string | null;
  is_active?: boolean;
  is_deleted?: boolean;
};

type TagGroupResult = {
  key: string;
  label: string;
  color: string;
  parent?: TagItem;
  tags: TagItem[];
};

const cardBorder = (color?: string) => `4px solid ${color || '#1677ff'}`;

function normalizeTagItems(input: unknown): TagItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: typeof item.name === 'string' ? item.name.trim() : '',
      color: typeof item.color === 'string' ? item.color : undefined,
      parent_id:
        item.parent_id === null || item.parent_id === undefined || item.parent_id === ''
          ? null
          : String(item.parent_id),
      is_active: typeof item.is_active === 'boolean' ? item.is_active : true,
      is_deleted: typeof item.is_deleted === 'boolean' ? item.is_deleted : false,
    }))
    .filter((item) => item.id.length > 0 && item.name.length > 0);
}

export default function TagManagementPage() {
  const { user } = useAuth();
  const bookId = user?.default_book_id;
  const navigate = useNavigate();

  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [tabKey, setTabKey] = useState('active');
  const [saving, setSaving] = useState(false);
  const [editModal, setEditModal] = useState<{ visible: boolean; tag: TagItem | null; isParent: boolean }>({
    visible: false,
    tag: null,
    isParent: false,
  });
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editParentId, setEditParentId] = useState<string | undefined>(undefined);

  const loadTags = () => {
    if (!bookId) return;
    setLoading(true);
    apiGet<TagItem[]>(`/api/tags?book_id=${bookId}&include_inactive=true`)
      .then((res) => {
        const nextTags = normalizeTagItems(res);
        setTags(nextTags);
        const activeGroupIds = buildGroups<string>(nextTags.filter((tag) => tag.is_active !== false)).map((group) =>
          group.parent ? String(group.parent.id) : group.key
        );
        setExpandedGroups(new Set(activeGroupIds));
      })
      .catch((error) => {
        console.error('Request failed:', error);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTags();
  }, [bookId]);

  const activeTags = useMemo(() => tags.filter((tag) => tag.is_active !== false && !tag.is_deleted), [tags]);
  const deletedTags = useMemo(() => tags.filter((tag) => tag.is_active === false || tag.is_deleted), [tags]);
  const activeGroups = useMemo(() => buildGroups<string>(activeTags), [activeTags]);
  const deletedGroups = useMemo(() => buildGroups<string>(deletedTags), [deletedTags]);

  const parentOptions = useMemo(
    () => activeTags.filter((tag) => !tag.parent_id).map((tag) => ({ id: tag.id, name: tag.name })),
    [activeTags]
  );

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSoftDelete = async (id: string) => {
    try {
      await apiDelete(`/api/tags/${id}?book_id=${bookId}`);
      message.success('删除成功');
      loadTags();
    } catch {
      message.error('删除失败');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await apiPost(`/api/tags/${id}/restore?book_id=${bookId}`);
      message.success('恢复成功');
      loadTags();
    } catch {
      message.error('恢复失败');
    }
  };

  const handlePermanentDelete = async (id: string) => {
    Modal.confirm({
      title: '彻底删除标签',
      content: '彻底删除后无法恢复，且会移除交易记录中的该标签关联。是否继续？',
      okText: '彻底删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiDelete(`/api/tags/${id}/permanent?book_id=${bookId}`);
          message.success('彻底删除成功');
          loadTags();
        } catch {
          message.error('彻底删除失败');
        }
      },
    });
  };

  const openEdit = (tag: TagItem, isParent: boolean) => {
    setEditModal({ visible: true, tag, isParent });
    setEditName(tag.name);
    setEditColor(tag.color || '#1677ff');
    setEditParentId(tag.parent_id || undefined);
  };

  const handleEditSave = async () => {
    if (!editModal.tag) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = { name: editName.trim() };
      if (editModal.isParent) {
        payload.color = editColor;
      }
      if (!editModal.isParent && editParentId) {
        payload.parent_id = editParentId;
      }
      await apiPatch(`/api/tags/${editModal.tag.id}?book_id=${bookId}`, payload);
      message.success('更新成功');
      setEditModal({ visible: false, tag: null, isParent: false });
      loadTags();
    } catch {
      message.error('更新失败');
    } finally {
      setSaving(false);
    }
  };

  if (!bookId) return <div style={{ padding: 16 }}>加载中...</div>;

  const renderGroups = (groups: TagGroupResult[], deletedView: boolean) => {
    if (groups.length === 0) {
      return deletedView ? (
        <Empty description="回收站为空" />
      ) : (
        <Empty
          description="暂无标签"
        >
          <Button type="primary" onClick={() => navigate('/tags/new')}>添加标签</Button>
        </Empty>
      );
    }

    return groups.map((group) => {
      const parent = group.parent;
      const groupId = parent ? String(parent.id) : group.key;
      const isExpanded = expandedGroups.has(groupId);
      const childItems = parent ? group.tags.filter((tag: TagItem) => String(tag.id) !== String(parent.id)) : group.tags;
      const childCount = childItems.length;

      return (
        <Card
          key={group.key}
          size="small"
          style={{ marginBottom: 8, borderLeft: cardBorder(group.color) }}
          bodyStyle={{ padding: 0 }}
        >
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: childCount > 0 ? 'pointer' : 'default',
              background: isExpanded ? 'var(--bg-elevated)' : 'var(--bg-card)',
            }}
            onClick={() => {
              if (childCount > 0) toggleGroup(groupId);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-block',
                  transition: 'transform 0.2s',
                  transform: childCount > 0 && isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  fontSize: 12,
                  color: '#999',
                  opacity: childCount > 0 ? 1 : 0,
                }}
              >
                ▶
              </span>
              <Tag color={group.color || 'blue'} style={{ margin: 0 }}>
                {parent?.name || group.label}
              </Tag>
              {parent?.parent_id ? <span style={{ fontSize: 12, color: '#999' }}>原父级已隐藏</span> : null}
              <span style={{ fontSize: 12, color: '#999' }}>{childCount} 个子标签</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }} onClick={(event) => event.stopPropagation()}>
              {deletedView ? (
                <>
                  <Button type="text" size="small" onClick={() => handleRestore(parent?.id || group.tags[0].id)}>
                    恢复
                  </Button>
                  <Button
                    type="text"
                    danger
                    size="small"
                    onClick={() => handlePermanentDelete(parent?.id || group.tags[0].id)}
                  >
                    彻底删除
                  </Button>
                </>
              ) : (
                <>
                  {parent ? <Button type="text" size="small" onClick={() => openEdit(parent, true)}>编辑</Button> : null}
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleSoftDelete(parent?.id || group.tags[0].id)}
                  />
                </>
              )}
            </div>
          </div>

          {isExpanded && childCount > 0 ? (
            <div style={{ borderTop: '1px solid var(--border-light)' }}>
              {childItems.map((child) => (
                <div
                  key={child.id}
                  style={{
                    padding: '10px 16px 10px 48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border-light)',
                    background: deletedView ? hexToRgba(group.color, 0.04) : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Tag color={group.color || 'blue'}>{child.name}</Tag>
                    {deletedView && child.parent_id && !deletedTags.some((tag) => tag.id === child.parent_id) ? (
                      <span style={{ fontSize: 12, color: '#999' }}>
                        原父级: {tags.find((tag) => tag.id === child.parent_id)?.name || '未知'}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {deletedView ? (
                      <>
                        <Button type="text" size="small" onClick={() => handleRestore(child.id)}>
                          恢复
                        </Button>
                        <Button type="text" danger size="small" onClick={() => handlePermanentDelete(child.id)}>
                          彻底删除
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="text" size="small" onClick={() => openEdit(child, false)}>编辑</Button>
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleSoftDelete(child.id)}
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      );
    });
  };

  return (
    <div>
      {loading ? (
        <Spin />
      ) : (
        <>
          <Tabs
            activeKey={tabKey}
            onChange={setTabKey}
            items={[
              { key: 'active', label: `标签 (${activeTags.length})`, children: renderGroups(activeGroups, false) },
              { key: 'deleted', label: `回收站 (${deletedTags.length})`, children: renderGroups(deletedGroups, true) },
            ]}
          />

          <Modal
            title={editModal.isParent ? '编辑一级标签' : '编辑二级标签'}
            open={editModal.visible}
            onCancel={() => setEditModal({ visible: false, tag: null, isParent: false })}
            onOk={handleEditSave}
            confirmLoading={saving}
          >
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 4, fontSize: 14, color: '#666' }}>名称</div>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            {editModal.isParent ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 4, fontSize: 14, color: '#666' }}>颜色</div>
                <Input
                  type="color"
                  value={editColor}
                  onChange={(event) => setEditColor(event.target.value)}
                  style={{ width: 60, height: 36, padding: 2 }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 4, fontSize: 14, color: '#666' }}>所属一级标签</div>
                <Select
                  value={editParentId}
                  onChange={setEditParentId}
                  style={{ width: '100%' }}
                  options={parentOptions.map((parent) => ({
                    value: parent.id,
                    label: parent.name,
                  }))}
                />
              </div>
            )}
            {!editModal.isParent ? (
              <div style={{ fontSize: 12, color: '#999' }}>颜色由一级标签决定，不可单独修改</div>
            ) : null}
          </Modal>
        </>
      )}
    </div>
  );
}
