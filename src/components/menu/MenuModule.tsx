import React from 'react';
import { MenuManagementPage } from '../../pages/MenuManagementPage';

interface MenuModuleProps {
  currentUserRole?: string;
  isViewOnly?: boolean;
  businessId?: string;
  onNavigate?: (path: string) => void;
  onRequestRoleSignIn?: () => void;
}

export const MenuModule: React.FC<MenuModuleProps> = ({ 
  currentUserRole, 
  isViewOnly = false,
  businessId,
  onNavigate,
  onRequestRoleSignIn,
}) => {
  return (
    <div id="menu-management-module-wrapper">
      <MenuManagementPage 
        userRole={currentUserRole} 
        isViewOnly={isViewOnly}
        businessId={businessId}
        onNavigate={onNavigate} 
        onRequestRoleSignIn={onRequestRoleSignIn}
      />
    </div>
  );
};
