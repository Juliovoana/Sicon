# -*- coding: utf-8 -*-
"""
Importa o histórico da planilha "CUSTOS piraja .xlsx"
(Modulos_servir/obras/) pro banco do módulo Obras, depois de rodar
obras.sql na unidade certa.

Cria (se ainda não existirem, por nome): a obra PIRAJA, os fornecedores
como `pessoa` (tipo_pessoa=JURIDICA), os materiais em
`obras_materiais` -- e os 67 lançamentos da aba "TODOS OS LANÇAMENTOS
PIRAJA".

Requisitos:
    pip install supabase pandas openpyxl

Uso:
    1. Rode obras.sql na unidade de teste/real.
    2. Preencha SUPABASE_SERVICE_ROLE_KEY e UNIDADE_NEGOCIO_ID abaixo
       (a service role key pula RLS -- não é a anon key do app).
    3. python importar_obras_piraja.py
    4. Confira o total impresso no final contra a Planilha5 da origem
       (R$ 215.373,35).
"""
import os
import pandas as pd
from supabase import create_client

SUPABASE_URL = "https://frzvcrcshkpvjdbbqkhz.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = ""  # <-- preencher antes de rodar (Supabase > Project Settings > API > service_role)
UNIDADE_NEGOCIO_ID = ""         # <-- preencher com o id da unidade de teste/real

CAMINHO_PLANILHA = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "obras", "CUSTOS piraja .xlsx"
)


def main():
    if not SUPABASE_SERVICE_ROLE_KEY or not UNIDADE_NEGOCIO_ID:
        raise SystemExit("Preencha SUPABASE_SERVICE_ROLE_KEY e UNIDADE_NEGOCIO_ID antes de rodar.")

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    df = pd.read_excel(CAMINHO_PLANILHA, sheet_name="TODOS OS LANÇAMENTOS PIRAJA", header=0)
    df = df.dropna(how="all")
    df.columns = [c.strip() for c in df.columns]  # "UND " -> "UND"

    # ---------- obra ----------
    existente = sb.table("obras_obras").select("id").eq("unidade_negocio_id", UNIDADE_NEGOCIO_ID).eq("nome", "PIRAJA").execute()
    if existente.data:
        obra_id = existente.data[0]["id"]
    else:
        obra_id = sb.table("obras_obras").insert({
            "unidade_negocio_id": UNIDADE_NEGOCIO_ID, "nome": "PIRAJA", "status": "ativa",
        }).execute().data[0]["id"]
    print(f"Obra PIRAJA: {obra_id}")

    # ---------- fornecedores (tabela pessoa, compartilhada com Financeiro) ----------
    mapa_pessoa = {}
    for nome in df["FORNECEDOR"].dropna().unique():
        nome = str(nome).strip()
        existente = sb.table("pessoa").select("id").eq("unidade_negocio_id", UNIDADE_NEGOCIO_ID).eq("nome", nome).execute()
        if existente.data:
            mapa_pessoa[nome] = existente.data[0]["id"]
        else:
            criado = sb.table("pessoa").insert({
                "unidade_negocio_id": UNIDADE_NEGOCIO_ID, "nome": nome, "tipo_pessoa": "JURIDICA",
            }).execute().data[0]
            mapa_pessoa[nome] = criado["id"]
    print(f"Fornecedores: {len(mapa_pessoa)}")

    # ---------- materiais ----------
    mapa_material = {}
    for nome in df["DESCRIÇÃO"].dropna().unique():
        nome = str(nome).strip()
        existente = sb.table("obras_materiais").select("id").eq("unidade_negocio_id", UNIDADE_NEGOCIO_ID).eq("nome", nome).execute()
        if existente.data:
            mapa_material[nome] = existente.data[0]["id"]
        else:
            criado = sb.table("obras_materiais").insert({
                "unidade_negocio_id": UNIDADE_NEGOCIO_ID, "nome": nome,
            }).execute().data[0]
            mapa_material[nome] = criado["id"]
    print(f"Materiais: {len(mapa_material)}")

    # ---------- lançamentos ----------
    total_importado = 0.0
    qtd = 0
    for _, r in df.iterrows():
        fornecedor = str(r.get("FORNECEDOR", "")).strip()
        material = str(r.get("DESCRIÇÃO", "")).strip()
        if not material:
            continue
        doc_bruto = str(r.get("DOC", "") or "").strip().upper()
        tipo_doc = doc_bruto if doc_bruto in ("PEDIDO", "DANFE") else None
        payload = {
            "unidade_negocio_id": UNIDADE_NEGOCIO_ID,
            "obra_id": obra_id,
            "data": r["DATA"].strftime("%Y-%m-%d") if pd.notna(r.get("DATA")) else None,
            "pessoa_id": mapa_pessoa.get(fornecedor),
            "material_id": mapa_material.get(material),
            "quantidade": float(r["QUANT"]) if pd.notna(r.get("QUANT")) else 0,
            "unidade": str(r.get("UND", "") or "").strip() or None,
            "valor": float(r["VALOR"]) if pd.notna(r.get("VALOR")) else 0,
            "frete": float(r["FRETE"]) if pd.notna(r.get("FRETE")) else 0,
            "placa": str(r.get("PLACA", "") or "").strip() or None,
            "motorista": str(r.get("MOTORISTA", "") or "").strip() or None,
            "aplicacao": str(r.get("APLICAÇÃO", "") or "").strip() or None,
            "tipo_doc": tipo_doc,
            "numero_nf": str(r.get("NUMERO DE NF", "") or "").strip() or None,
            "transportador": str(r.get("TRANSPORTADOR", "") or "").strip() or None,
            "observacao": str(r.get("Unnamed: 19", "") or "").strip() or None,
        }
        sb.table("obras_lancamentos").insert(payload).execute()
        total_importado += payload["valor"]
        qtd += 1

    print(f"Lançamentos importados: {qtd}")
    print(f"Total em valor: R$ {total_importado:,.2f}".replace(",", "_").replace(".", ",").replace("_", "."))
    print("Confira contra o Total Geral da aba Planilha5 da planilha original (R$ 215.373,35).")


if __name__ == "__main__":
    main()
