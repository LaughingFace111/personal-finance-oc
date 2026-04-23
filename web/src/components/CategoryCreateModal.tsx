import { useEffect, useMemo, useState } from 'react';
import { Form, Input, Modal, Radio, Select, message } from 'antd';
import { apiGet, apiPost } from '../services/api';

type CategoryTypeValue = 'expense' | 'income';

type CategoryItem = {
  id: string;
  name: string;
  parent_id?: string;
  category_type?: string;
  color?: string;
  icon?: string;
  is_active?: boolean;
  is_deleted?: boolean;
};

interface CategoryCreateModalProps {
  open: boolean;
  bookId: string | null;
  initialType?: CategoryTypeValue;
  onCancel: () => void;
  onCreated?: (category: CategoryItem) => void;
}

export function CategoryCreateModal({
  open,
  bookId,
  initialType = 'expense',
  onCancel,
  onCreated,
}: CategoryCreateModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [allCategories, setAllCategories] = useState<CategoryItem[]>([]);

  useEffect(() => {
    if (!open || !bookId) return;
    apiGet<CategoryItem[]>(`/api/categories?book_id=${bookId}`)
      .then((res) => setAllCategories((res || []).filter((item) => item.is_active !== false && item.is_deleted !== true)))
      .catch(() => setAllCategories([]));
  }, [bookId, open]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: '',
      category_type: initialType,
      level: 'level1',
      parent_id: undefined,
      color: '',
      icon: '',
    });
  }, [form, initialType, open]);

  const selectedType = Form.useWatch('category_type', form) as CategoryTypeValue | undefined;
  const selectedLevel = Form.useWatch('level', form) as 'level1' | 'level2' | undefined;

  const parentOptions = useMemo(
    () =>
      allCategories.filter(
        (item) => !item.parent_id && item.category_type === selectedType
      ),
    [allCategories, selectedType]
  );

  useEffect(() => {
    const currentParentId = form.getFieldValue('parent_id');
    if (!currentParentId) return;
    const stillValid = parentOptions.some((item) => item.id === currentParentId);
    if (!stillValid || selectedLevel !== 'level2') {
      form.setFieldValue('parent_id', undefined);
    }
  }, [form, parentOptions, selectedLevel]);

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
        parent_id: values.level === 'level2' ? values.parent_id : null,
        book_id: bookId,
        category_type: values.category_type,
        color: values.color?.trim() || null,
        icon: values.icon?.trim() || null,
        is_active: true,
      };
      const created = await apiPost<CategoryItem>('/api/categories', payload);
      message.success('分类创建成功');

      // Capture the created category before closing
      const newCategory: CategoryItem = {
        id: created.id,
        name: created.name || payload.name,
        parent_id: created.parent_id || undefined,
        category_type: created.category_type || payload.category_type,
        color: created.color || payload.color || undefined,
        icon: created.icon || payload.icon || undefined,
        is_active: true,
      };

      // 只关闭 CategoryCreateModal，不执行选中
      // 防止同时关闭两个弹窗导致 HierarchyPickerModal 状态异常
      form.resetFields();
      setLoading(false);
      onCancel();
    } catch (err) {
      if (err instanceof Error && err.message) return;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="新建分类"
      open={open}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={handleOk}
      okText="创建并选中"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: !bookId }}
      destroyOnClose
      bodyStyle={{ overflow: 'hidden' }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="分类名称"
          rules={[{ required: true, message: '请输入分类名称' }]}
        >
          <Input placeholder="请输入分类名称" maxLength={100} />
        </Form.Item>

        <Form.Item
          name="category_type"
          label="分类类型"
          rules={[{ required: true, message: '请选择分类类型' }]}
        >
          <Radio.Group optionType="button" buttonStyle="solid">
            <Radio.Button value="expense">支出</Radio.Button>
            <Radio.Button value="income">收入</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="level"
          label="分类层级"
          rules={[{ required: true, message: '请选择分类层级' }]}
        >
          <Radio.Group optionType="button" buttonStyle="solid">
            <Radio.Button value="level1">一级分类</Radio.Button>
            <Radio.Button value="level2">二级分类</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="parent_id"
          label="上级分类"
          style={{ touchAction: 'none', overflow: 'hidden' }}
          rules={[
            {
              validator: async (_, value) => {
                if (selectedLevel === 'level2' && !value) {
                  throw new Error('创建二级分类时必须选择上级分类');
                }
              },
            },
          ]}
        >
          <Select
            allowClear
            disabled={selectedLevel !== 'level2'}
            placeholder={
              selectedLevel === 'level2'
                ? (parentOptions.length > 0 ? '选择一级分类' : '当前类型暂无可用一级分类')
                : '一级分类无需选择上级'
            }
            options={parentOptions.map((item) => ({
              value: item.id,
              label: `${item.icon ? `${item.icon} ` : ''}${item.name}`,
            }))}
          />
        </Form.Item>

        <Form.Item name="icon" label="图标（可选）">
          <Input placeholder="例如：🍜" maxLength={8} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
