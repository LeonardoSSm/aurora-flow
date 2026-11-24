-- MySQL de desenvolvimento do erp-lookup (profile erp-dev do docker-compose).
-- Roda sozinho na primeira subida do container (docker-entrypoint-initdb.d), como root.
-- Imita a estrutura da Fase 0 do plano: um banco "do ERP" com dados falsos, um banco
-- tijuca_lookup só com views e um usuário que só enxerga as views.
-- Nada aqui existe no ERP real: a lista "exemplo" é só para testar a API.

-- Sem isto o cliente do initdb lê o arquivo como latin1 e grava os acentos estragados.
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS erp_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE erp_demo.itens_exemplo (
  codigo    VARCHAR(20)  NOT NULL PRIMARY KEY,
  descricao VARCHAR(120) NOT NULL,
  ativo     TINYINT(1)   NOT NULL DEFAULT 1
);

INSERT INTO erp_demo.itens_exemplo (codigo, descricao, ativo) VALUES
  ('001', 'Açúcar cristal', 1),
  ('002', 'Café torrado', 1),
  ('003', 'Item inativo de exemplo', 0),
  ('004', 'Embalagem 100% reciclada', 1),
  ('005', 'Etiqueta_adesiva', 1),
  ('006', 'Farinha de trigo', 1),
  ('007', 'Fermento biológico', 1);

CREATE DATABASE IF NOT EXISTS tijuca_lookup CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Contrato com a API: value (código), label (texto exibido), busca (onde a pesquisa procura).
CREATE VIEW tijuca_lookup.vw_exemplo AS
SELECT codigo                         AS value,
       CONCAT(codigo, ' — ', descricao) AS label,
       CONCAT_WS(' ', codigo, descricao) AS busca
FROM erp_demo.itens_exemplo
WHERE ativo = 1;

-- A view roda com as permissões de quem a criou (SQL SECURITY DEFINER): o usuário da API
-- não precisa, e não tem, acesso a erp_demo.
CREATE USER 'tijuca_lookup'@'%' IDENTIFIED BY 'tijuca-lookup-dev';
GRANT SELECT ON tijuca_lookup.* TO 'tijuca_lookup'@'%';
