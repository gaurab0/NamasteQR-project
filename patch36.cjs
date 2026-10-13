const fs = require('fs');
let code = fs.readFileSync('src/components/config/BusinessConfigurationCenter.tsx', 'utf8');

const replacement = `  const businessId = business?.id || user?.business?.id || 'default-biz';

  const handleUpdateDateLocalization = async (field: 'date_format_nav' | 'date_format_billing', value: string) => {
    try {
      await rbacService.updateBusinessProfileApi({ [field]: value }, businessId);
      const freshBiz = {
        ...businessProfile,
        [field]: value,
      };
      setBusinessProfile(freshBiz as any);
      updateBusiness(freshBiz as any);
    } catch (err: any) {
      alert(\`Failed to update localization: \${err.message}\`);
    }
  };

  const activeBusiness = businessProfile || business || user?.business;`;

code = code.replace(/  const businessId = business\?\.id \|\| user\?\.business\?\.id \|\| 'default-biz';/m, replacement);

code = code.replace(/onChange=\{\(e\) => handleFieldChange\('date_format_nav', e\.target\.value\)\}/g, 
  "onChange={(e) => handleUpdateDateLocalization('date_format_nav', e.target.value)}");

code = code.replace(/onChange=\{\(e\) => handleFieldChange\('date_format_billing', e\.target\.value\)\}/g, 
  "onChange={(e) => handleUpdateDateLocalization('date_format_billing', e.target.value)}");

fs.writeFileSync('src/components/config/BusinessConfigurationCenter.tsx', code, 'utf8');
console.log('Fixed date localization handler');
