import { useEffect, useMemo, useState } from 'react';
import { Form, Input, Modal, Select, Tag, message } from 'antd';
import { apiGet, apiPost } from '../services/api';

type ParentTag = {
  id: string;
  name: string;
  color?: string;
};

interface TagCreateModalProps {
  open: boolean;
  bookId: string | null;
  initialName?: string;
  onCancel: () => void;
  onCreated?: (tag: { id?: string; name: string; parent_id?: string; color?: string }) => void;
}

export function TagCreateModal({
  open,
  bookId,
  initialName = '',
  onCancel,
  onCreated,
}: TagCreateModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [parentTags, setParentTags] = useState<ParentTag[]>([]);

  useEffect(() => {
    if (!open || !bookId) return;
    apiGet<ParentTag[]>(`/api/tags/first-level?book_id=${bookId}`)
      .then((res) => setParentTags(res || []))
      .catch(() => setParentTags([]));
  }, [bookId, open]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: initialName,
      parent_id: undefined,
    });
  }, [form, initialName, open]);

  const selectedParentId = Form.useWatch('parent_id', form);

  const selectedParentColor = useMemo(() => {
    return parentTags.find((item) => item.id === selectedParentId)?.color || '';
  }, [parentTags, selectedParentId]);

  const handleOk = async () => {
    if (!bookId) {
      message.error('无法获取账本信息');
      return;
    }

    try {
      const values = await form.validateFields();
      setLoading(true);
      const payload = {
        name: values.name.trim(),
        parent_id: values.parent_id,
        book_id: bookId,
      };
      const created = await apiPost<{ id?: string; name?: string; parent_id?: string; color?: string }>('/api/tags', payload);
      message.success('创建成功');
      onCreated?.({
        id: created?.id,
        name: created?.name || payload.name,
        parent_id: created?.parent_id || payload.parent_id,
        color: created?.color || selectedParentColor || undefined,
      });
      form.resetFields();
    } catch (err) {
      if (err instanceof Error && err.message) return;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="添加标签"
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={handleOk}
      okText="创建并选中"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: !bookId || parentTags.length === 0 }}
    >
      <Form form={form} layout="vertical" initialValues={{ name: initialName }}>
        <Form.Item
          name="name"
          label="标签名称"
          rules={[{ required: true, message: '请输入标签名称' }]}
        >
          <Input placeholder="请输入标签名称" />
        </Form.Item>

        <Form.Item
          name="parent_id"
          label="所属一级标签"
          rules={[{ required: true, message: '请选择一级标签' }]}
        >
          <Select placeholder={parentTags.length > 0 ? '请选择一级标签' : '请先创建一级标签'}>
            {parentTags.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                <Tag color={item.color || 'blue'}>{item.name}</Tag>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {selectedParentColor ? (
          <div style={{ marginTop: '-4px', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            颜色将继承一级标签：
            <span
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                marginLeft: '6px',
                marginRight: '6px',
                borderRadius: '4px',
                background: selectedParentColor,
                verticalAlign: 'middle',
              }}
            />
            {selectedParentColor}
          </div>
        ) : null}

        {parentTags.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            暂无一级标签，当前只能先去标签管理页创建一级标签。
          </div>
        ) : null}
      </Form>
    </Modal>
  );
}
