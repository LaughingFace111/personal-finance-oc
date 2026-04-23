import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Radio, Select, Space, message } from 'antd';
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

    let values;
    try {
      values = await form.validateFields();
    } catch {
      // 表单校验失败，AntD 已展示内联错误，无需处理
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: values.name.trim(),
        parent_id: values.level === 'level2' ? values.parent_id : null,
        book_id: bookId,
        category_type: values.category_type,
        color: values.color?.trim() || null,
        icon: values.icon?.trim() || null,
        is_active: true,
      };

      // 10秒超时兜底，确保 API 挂死时也能关闭弹窗
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('网络请求超时，请重试')), 10000)
      );
      const created = await Promise.race([
        apiPost<CategoryItem>('/api/categories', payload),
        timeoutPromise,
      ]);
      message.success('分类创建成功');

      const newCategory: CategoryItem = {
        id: created.id,
        name: created.name || payload.name,
        parent_id: created.parent_id || undefined,
        category_type: created.category_type || payload.category_type,
        color: created.color || payload.color || undefined,
        icon: created.icon || payload.icon || undefined,
        is_active: true,
      };

      form.resetFields();
      onCancel();
      // AntD 不再跟踪 Promise，状态更新在同一次事件循环中批处理，无需 setTimeout
      onCreated?.(newCategory);
    } catch (err) {
      // 仅展示真实的运行时错误，而非静默吞掉
      message.error(err instanceof Error ? err.message : '创建失败，请重试');
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
      footer={
        <Space>
          <Button
            onClick={() => {
              form.resetFields();
              onCancel();
            }}
          >
            取消
          </Button>
          <Button
            type="primary"
            disabled={!bookId || loading}
            loading={loading}
            onClick={() => {
              void handleOk();
            }}
          >
            创建并选中
          </Button>
        </Space>
      }
      maskClosable
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
