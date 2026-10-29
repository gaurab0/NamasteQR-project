import React from 'react';
import { AppRole } from '../../types/rbac';
import { TableManagementGrid } from '../tables/TableManagementGrid';

interface CheckInsModuleProps {
  currentUserRole?: string;
  businessId?: string;
  businessName?: string;
  isViewOnly?: boolean;
  onRequestRoleSignIn?: () => void;
}

export const CheckInsModule: React.FC<CheckInsModuleProps> = ({ 
  currentUserRole, 
  businessId = 'default-business',
  businessName = 'Restaurant Venue',
  isViewOnly = false,
  onRequestRoleSignIn
}) => {
  return (
    <div id="tables-module-container" className="space-y-6">
      <TableManagementGrid
        businessId={businessId}
        businessName={businessName}
        currentUserRole={currentUserRole as AppRole}
        isViewOnly={isViewOnly}
        onRequestRoleSignIn={onRequestRoleSignIn}
      />
    </div>
  );
};
