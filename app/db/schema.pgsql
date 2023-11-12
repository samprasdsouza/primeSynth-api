\c primesynth

CREATE TABLE IF NOT EXISTS products (
    id VARCHAR (255) PRIMARY KEY,
    name varchar(255) NOT NULL,
    cat_no varchar(255) NOT NULL,
    cas_no varchar(255) NOT NULL,
    mol_formula varchar(255) NOT NULL,
    mol_weight varchar(255) NOT NULL,
    inv_status varchar(255) NOT NULL,
    is_deleted boolean DEFAULT false,
    created_by varchar(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_by varchar(255),
    updated_at timestamp with time zone
)

INSERT INTO products (id, name, cat_no, cas_no, mol_formula, mol_weight, inv_status, is_deleted, created_by, created_at)
VALUES ( 1, 'Abacavir Sulfate', 'SZ-A049001', '188062-50-2', 'C14H18N6O : 1/2(H2SO4)', '286.3', 'Custom Synthesis', false, 'samprasdsouza@test.com', '2015-05-20'); 