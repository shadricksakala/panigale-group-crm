CREATE TABLE crm_panipay_unit_mappings (
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  panipay_organization_id TEXT NOT NULL,
  panipay_profile_name TEXT NOT NULL,
  mapped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id, unit_id),
  UNIQUE(tenant_id, panipay_organization_id),
  FOREIGN KEY(tenant_id, unit_id) REFERENCES crm_units(tenant_id, id) ON DELETE CASCADE
);

INSERT INTO crm_panipay_unit_mappings(tenant_id,unit_id,panipay_organization_id,panipay_profile_name)
SELECT t.id,u.id,'a2f124ed-9792-445f-995d-d16fa63547d6','Advanced Super-Intelligence Lab ASIL'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.name='Panigale Group' AND u.slug='asil';
INSERT INTO crm_panipay_unit_mappings(tenant_id,unit_id,panipay_organization_id,panipay_profile_name)
SELECT t.id,u.id,'53c74ccc-1f1-4042-a2b5-b128ae7bca14','Euroza Consulting'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.name='Panigale Group' AND u.slug='euroza';
INSERT INTO crm_panipay_unit_mappings(tenant_id,unit_id,panipay_organization_id,panipay_profile_name)
SELECT t.id,u.id,'e868cc0f-1844-4626-b79e-63da00e7dc31','FutureCampus Africa'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.name='Panigale Group' AND u.slug='futurecampus';
INSERT INTO crm_panipay_unit_mappings(tenant_id,unit_id,panipay_organization_id,panipay_profile_name)
SELECT t.id,u.id,'d1b04c4f-8bd3-43a3-b615-74583ee16638','PaniPay Platform'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.name='Panigale Group' AND u.slug='panipay';
INSERT INTO crm_panipay_unit_mappings(tenant_id,unit_id,panipay_organization_id,panipay_profile_name)
SELECT t.id,u.id,'00cd63af-51e7-4d74-bbc1-43bf55c68984','Ultra Financial Academy'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.name='Panigale Group' AND u.slug='ultra-fx-academy';
INSERT INTO crm_panipay_unit_mappings(tenant_id,unit_id,panipay_organization_id,panipay_profile_name)
SELECT t.id,u.id,'5734325d-5335-4275-8782-d94b03fbd408','Zedprenuers'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.name='Panigale Group' AND u.slug='zedpreneurs';
