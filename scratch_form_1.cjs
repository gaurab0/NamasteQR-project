const fs = require('fs');
let c = fs.readFileSync('src/components/menu/MenuItemFormModal.tsx', 'utf8');

c = c.replace(
  "const [formError, setFormError] = useState<string | null>(null);",
  "const [formError, setFormError] = useState<string | null>(null);\n  const [previewSelectedVariantId, setPreviewSelectedVariantId] = useState<string | null>(null);"
);

c = c.replace(
  "const handleUpdateVariant = (index: number, field: 'name' | 'price', val: any) => {",
  "const handleUpdateVariant = (index: number, field: 'name' | 'price' | 'image_url' | 'description', val: any) => {"
);

const uploadFunc = `
  const handleVariantImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setFormError('Variant image file size should be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          handleUpdateVariant(index, 'image_url', reader.result);
          setFormError(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveVariant =`;

c = c.replace("const handleRemoveVariant =", uploadFunc);

fs.writeFileSync('src/components/menu/MenuItemFormModal.tsx', c);
