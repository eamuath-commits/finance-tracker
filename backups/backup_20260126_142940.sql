--
-- PostgreSQL database dump
--

\restrict m0N3jBYCCDZjhCCEkisQ3ezf9dVyZQsqqizwgiCfSlaLRvjiif1dlynM6a1OGe4

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: accounttype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.accounttype AS ENUM (
    'CHECKING',
    'SAVINGS',
    'CREDIT_CARD',
    'LOAN'
);


ALTER TYPE public.accounttype OWNER TO postgres;

--
-- Name: allocationruletype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.allocationruletype AS ENUM (
    'CATEGORY',
    'LOAN'
);


ALTER TYPE public.allocationruletype OWNER TO postgres;

--
-- Name: messagestatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.messagestatus AS ENUM (
    'PENDING',
    'PARSED',
    'FAILED',
    'IGNORED'
);


ALTER TYPE public.messagestatus OWNER TO postgres;

--
-- Name: paymentstatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.paymentstatus AS ENUM (
    'PAID',
    'PENDING',
    'BUDGET'
);


ALTER TYPE public.paymentstatus OWNER TO postgres;

--
-- Name: transactiontype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.transactiontype AS ENUM (
    'DEBIT',
    'CREDIT'
);


ALTER TYPE public.transactiontype OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_aliases (
    id integer NOT NULL,
    account_id character varying NOT NULL,
    alias_name character varying NOT NULL,
    last_4_digits character varying NOT NULL
);


ALTER TABLE public.account_aliases OWNER TO postgres;

--
-- Name: account_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.account_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.account_aliases_id_seq OWNER TO postgres;

--
-- Name: account_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.account_aliases_id_seq OWNED BY public.account_aliases.id;


--
-- Name: account_audits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_audits (
    id character varying NOT NULL,
    account_id character varying NOT NULL,
    audit_date timestamp without time zone,
    system_balance double precision NOT NULL,
    actual_balance double precision NOT NULL,
    difference double precision NOT NULL,
    status character varying NOT NULL,
    notes text
);


ALTER TABLE public.account_audits OWNER TO postgres;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id character varying NOT NULL,
    name character varying NOT NULL,
    account_type public.accounttype NOT NULL,
    first_4_digits character varying,
    bank_name character varying,
    bank_logo_url character varying,
    last_4_digits character varying,
    current_balance double precision,
    notes text,
    credit_limit double precision,
    interest_rate double precision,
    minimum_payment double precision,
    is_income boolean,
    last_successful_audit_date timestamp without time zone
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- Name: allocation_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.allocation_history (
    id character varying NOT NULL,
    month character varying NOT NULL,
    income double precision,
    needs_planned double precision,
    needs_actual double precision,
    wants_planned double precision,
    wants_actual double precision,
    savings_planned double precision,
    savings_actual double precision
);


ALTER TABLE public.allocation_history OWNER TO postgres;

--
-- Name: allocation_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.allocation_rules (
    id character varying NOT NULL,
    keyword character varying NOT NULL,
    field character varying DEFAULT 'merchant'::character varying,
    percentage double precision NOT NULL,
    target_category character varying,
    category_group character varying NOT NULL
);


ALTER TABLE public.allocation_rules OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id character varying NOT NULL,
    name character varying NOT NULL,
    type character varying DEFAULT 'BOTH'::character varying
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: currency_wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.currency_wallets (
    id character varying NOT NULL,
    account_id character varying NOT NULL,
    currency_code character varying NOT NULL,
    balance double precision,
    last_updated timestamp without time zone
);


ALTER TABLE public.currency_wallets OWNER TO postgres;

--
-- Name: loans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.loans (
    id character varying NOT NULL,
    name character varying NOT NULL,
    principal_amount double precision NOT NULL,
    interest_rate double precision NOT NULL,
    start_date date NOT NULL,
    term_months integer NOT NULL,
    remaining_balance double precision NOT NULL,
    monthly_payment double precision,
    display_order integer DEFAULT 0,
    due_day integer,
    notes text
);


ALTER TABLE public.loans OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    obligation_id character varying NOT NULL,
    payment_date timestamp without time zone,
    amount double precision NOT NULL,
    note character varying,
    billing_month character varying,
    status public.paymentstatus DEFAULT 'PAID'::public.paymentstatus,
    transaction_id character varying,
    planned_amount double precision
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: obligation_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.obligation_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.obligation_history_id_seq OWNER TO postgres;

--
-- Name: obligation_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.obligation_history_id_seq OWNED BY public.payments.id;


--
-- Name: obligations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.obligations (
    id character varying NOT NULL,
    name character varying NOT NULL,
    amount double precision,
    due_day integer NOT NULL,
    category character varying,
    provider character varying,
    notes text,
    display_order integer
);


ALTER TABLE public.obligations OWNER TO postgres;

--
-- Name: raw_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.raw_messages (
    id character varying NOT NULL,
    sender character varying,
    body text NOT NULL,
    "timestamp" timestamp without time zone,
    status public.messagestatus,
    error_log text
);


ALTER TABLE public.raw_messages OWNER TO postgres;

--
-- Name: savings_goals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.savings_goals (
    id character varying NOT NULL,
    name character varying NOT NULL,
    target_amount double precision NOT NULL,
    current_amount double precision,
    target_date date,
    icon character varying,
    color character varying
);


ALTER TABLE public.savings_goals OWNER TO postgres;

--
-- Name: training_examples; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.training_examples (
    id character varying NOT NULL,
    raw_text character varying NOT NULL,
    parsed_json text NOT NULL,
    created_at timestamp without time zone
);


ALTER TABLE public.training_examples OWNER TO postgres;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id character varying NOT NULL,
    account_id character varying,
    amount double precision NOT NULL,
    merchant character varying,
    "timestamp" timestamp without time zone,
    raw_sms_content text,
    category character varying,
    balance_after_transaction double precision,
    logo_url character varying,
    type character varying DEFAULT 'debit'::character varying NOT NULL,
    status character varying DEFAULT 'completed'::character varying NOT NULL,
    notes text,
    fees double precision DEFAULT 0.0,
    original_amount double precision,
    original_currency character varying,
    exchange_rate double precision
);


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: account_aliases id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_aliases ALTER COLUMN id SET DEFAULT nextval('public.account_aliases_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.obligation_history_id_seq'::regclass);


--
-- Data for Name: account_aliases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_aliases (id, account_id, alias_name, last_4_digits) FROM stdin;
1	0cbe5b34-c256-4a86-a025-84916176468f	mada	9365
2	ca3f031d-7975-46cb-9f89-71bf19fd4d46	Visa	4897
3	4487ee56-905e-46b4-ade7-07cc761cbada	mada	8438
5	7e0d6ea5-dd63-41da-a003-eaca541b25f7	Visa	1645
6	5a8561f7-a712-48b0-baf2-fbbf37a9a49b	mada	6341
7	9d3b10e2-03df-4554-9beb-3869d243465a	Visa	7868
9	4af8d356-8af4-4d6f-b959-bd4518504ffd	mada	4390
\.


--
-- Data for Name: account_audits; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_audits (id, account_id, audit_date, system_balance, actual_balance, difference, status, notes) FROM stdin;
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts (id, name, account_type, first_4_digits, bank_name, bank_logo_url, last_4_digits, current_balance, notes, credit_limit, interest_rate, minimum_payment, is_income, last_successful_audit_date) FROM stdin;
1921f76d-0ae6-485d-8688-68f0ab9dcb06	Main Checking	CHECKING	\N	Al Rajhi Bank	\N	1234	15450	\N	\N	\N	\N	f	\N
1d4fdee9-1a3f-419d-868b-d1ce10c78f70	Platinum Card	CREDIT_CARD	\N	SNB	\N	9876	-2300.5	\N	20000	\N	\N	f	\N
cdc7069f-9e86-46c0-8b53-83722f58e931	Jazira Saving	SAVINGS	\N	Jazira Bank	/banks/ajb.png	8002	250016		\N	\N	\N	f	\N
7e0d6ea5-dd63-41da-a003-eaca541b25f7	Visa Infinite	CREDIT_CARD	\N	Jazira Bank	/banks/ajb.png	1645	15004		45000	\N	\N	f	\N
4848c382-2a39-4cff-8d06-027607bb34c7	Payroll	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	3264	7000		\N	\N	\N	t	\N
5a8561f7-a712-48b0-baf2-fbbf37a9a49b	Liability	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	9384	80000		\N	\N	\N	f	\N
c430dd59-ecee-4ffb-b499-72ae46ec3097	STC	CHECKING	\N	STC Bank	/banks/bank2.png	0863	1000	\N	\N	\N	\N	f	\N
ca3f031d-7975-46cb-9f89-71bf19fd4d46	Ajwa Infinite	CREDIT_CARD	\N	Jazira Bank	/banks/ajb.png	4897	19385.79		\N	\N	\N	f	\N
0cbe5b34-c256-4a86-a025-84916176468f	Expense	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	1505	76987.71		\N	\N	\N	f	\N
9905717a-fce2-462c-8d6c-9e21d67dcf37	General	CHECKING	\N	AlRajhiBank	/banks/bank2.png	7772	29600		\N	\N	\N	f	\N
4487ee56-905e-46b4-ade7-07cc761cbada	Jazira Checking	SAVINGS	\N	Jazira Bank	/banks/ajb.png	8001	106400		\N	\N	\N	f	\N
b874ab5b-7562-4bd4-ba54-3344dd8b9aa7	Buckets	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	1964	0		\N	\N	\N	f	\N
4af8d356-8af4-4d6f-b959-bd4518504ffd	Grocery	CHECKING	\N	AlRajhiBank	https://logo.clearbit.com/alrajhibank.com.sa	2104	1000		\N	\N	\N	f	\N
310aca4c-fd5b-481b-a8b9-52eae56143b2	House	CHECKING	\N	AlRajhiBank	/banks/bank2.png	2533	0		\N	\N	\N	f	\N
f88d6c09-1a09-4679-a98b-09294ef3be40	Auto Lease	CHECKING	\N	AlRajhiBank	/banks/bank2.png	5225	0		\N	\N	\N	f	\N
9d3b10e2-03df-4554-9beb-3869d243465a	Travel Plus	CREDIT_CARD	\N	AlRajhiBank	/banks/bank2.png	7868	0		\N	\N	\N	f	\N
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alembic_version (version_num) FROM stdin;
\.


--
-- Data for Name: allocation_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.allocation_history (id, month, income, needs_planned, needs_actual, wants_planned, wants_actual, savings_planned, savings_actual) FROM stdin;
\.


--
-- Data for Name: allocation_rules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.allocation_rules (id, keyword, field, percentage, target_category, category_group) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, type) FROM stdin;
a118f6bb-a7a7-4754-b114-525e33638e89	Salary	BOTH
fa573ce3-1c72-4a4c-8cbe-0ee8b3ba41f7	Other	BOTH
61894fb2-6fab-4bfb-a035-974eb0b8d988	Utilities	BOTH
d5cb2c46-6d2d-4b6a-9c68-ca82f32bbd60	Subscription	BOTH
bd302bb7-937e-4e93-a787-a462ccf883c9	Auto Loan	BOTH
e36f7fe1-ba6d-4347-abc6-c9f3cd84fb3f	House	BOTH
e7c48d8d-ec36-4ea9-a361-a22462ff1c79	Loan	BOTH
7192b1cf-f71b-4674-a930-269911079501	Credit Card	BOTH
d863ef78-43e0-48d2-a0bf-14060e935a63	School	BOTH
76fee12b-1e18-4abf-ae57-13d56828cd10	Personal Expense	BOTH
\.


--
-- Data for Name: currency_wallets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.currency_wallets (id, account_id, currency_code, balance, last_updated) FROM stdin;
c68aea32-c1a8-4edf-8f4c-1888865d675c	1921f76d-0ae6-485d-8688-68f0ab9dcb06	SAR	15450	2026-01-26 09:44:21.070774
6d5f85b3-c561-444b-bea7-f63965182d88	1d4fdee9-1a3f-419d-868b-d1ce10c78f70	SAR	-2300.5	2026-01-26 09:44:21.070776
\.


--
-- Data for Name: loans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.loans (id, name, principal_amount, interest_rate, start_date, term_months, remaining_balance, monthly_payment, display_order, due_day, notes) FROM stdin;
968cecf4-2cce-402c-82ab-893e33afd014	Mortgage	1334598.52	2.949996478	2020-12-30	180	1334598.52	\N	1	26	\N
4b2e61aa-aeda-4b2c-9240-9959005f648a	Personal	992200	3.1	2024-05-11	60	992200	\N	0	26	\N
\.


--
-- Data for Name: obligations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.obligations (id, name, amount, due_day, category, provider, notes, display_order) FROM stdin;
0ef4388e-39b5-497a-abc1-3fdefe53a59e	OPENAI	\N	2	Subscription		this is my subscription from chatgpt	4
a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	Maid	1500	31	Salary	\N	\N	2
cd39f2d1-b735-4d09-9f97-7c9139a52dc8	Adobe	\N	4	Subscription	\N	\N	5
996098cb-7a1f-4b68-afe4-6fa38cb0d4c2	Microsoft	\N	8	Subscription	\N	\N	6
573630a7-dce3-40a7-b54f-b97d021c1503	Netflix	71	14	Subscription	\N	\N	9
40ea5e71-48ce-4bbb-945b-b83c546b8f26	Expenses	\N	25	Personal Expense	\N	\N	10
e4759a70-0dca-43db-929f-95aa619440b6	Sultan School	1300	1	School	\N	\N	11
6112fce4-57d7-4454-8071-f812287137d5	KIA	3032.19	25	Auto Loan	\N	\N	19
7672d5fb-c564-4aac-9d31-239d1112c60d	Grocery	5000	25	House	\N	\N	20
df740791-f777-43ad-81b4-6a2284b5c129	Personal	19099.85	26	Loan	\N	\N	21
658e0f17-59e9-41db-915c-542ad160faec	Mortgage	10695.33	26	Loan	\N	\N	22
275c6a76-793e-450c-831f-077d1104649a	Visa Infinite	4466.5	26	Credit Card	\N	\N	23
948d3bf9-31a7-4349-ac52-a780cc99bf8f	Ajwa Infinite	10000	26	Credit Card	\N	\N	24
7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	Mae	1800	31	Salary	\N	MAE CLAIRE	0
5f9d5e50-9dc2-4734-b963-e851c6c83c76	Norma	1500	1	Salary	\N	NORMA CAFE	1
b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	Muhammed	1800	31	Salary	\N	MOHAMMED ISLAM	3
8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	Water	402.1	4	Utilities	NWC		12
6e80c418-0538-45d8-ad3c-3fcb62207e93	My Phone	1500	4	Utilities	STC		13
05c34fbc-3023-4965-aeec-feea39c5cd5f	Quicknet	85.01	4	Utilities	STC	Biller:001\nService:STC BILL\nBill:05224907461	15
5805b7a5-eb19-4238-9efb-33332feff070	Internet	360	4	Utilities	Salam		14
07ee8383-65f7-4419-add2-db66b67f97d8	Data	67.85	28	Utilities	Zain		18
17a08cb1-1624-459f-99fa-b8a14cdd5ff0	Sarah Phone	347.5	4	Utilities	STC		16
afcc7a13-64b9-4e41-8716-0ce2e0b57a34	Electricity	1300	14	Utilities	SE		17
6ad25cce-5c21-4d3f-b773-960c3cdea7b1	Apple iCloud	\N	16	Subscription			8
3925eec8-28e8-4f40-8478-c0eb8752d83c	REALDEBR	\N	11	Subscription		this is for torrent subscription	7
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, obligation_id, payment_date, amount, note, billing_month, status, transaction_id, planned_amount) FROM stdin;
301	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.778084	3500	Bulk Import	2025-01-01	PAID	\N	\N
306	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.800018	4000	Bulk Import	2025-06-01	PAID	\N	\N
39	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:58:23.296	4500	Manual History Log	2025-10-01	PAID	\N	\N
311	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 11:31:40.532	1200	Manual History Log	2025-10-01	PAID	\N	\N
52	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 12:12:20.017	3032.19	Manual History Log	2025-12-01	PAID	\N	\N
20	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 12:12:58.888	85.01	Manual History Log	2025-12-01	PAID	\N	\N
56	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 00:51:34.741	19099.85	Manual History Log	2025-11-01	PAID	\N	\N
6	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 00:54:00.602	354.5		2025-11-01	PAID	\N	\N
71	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 10:34:17.56024	3032.19	Bulk Import	2025-08-01	PAID	\N	\N
72	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 10:34:17.564149	3032.19	Bulk Import	2025-09-01	PAID	\N	\N
7	7672d5fb-c564-4aac-9d31-239d1112c60d	2025-12-04 00:00:00	6000	Manual Manual History Log	2025-12-01	PAID	\N	\N
58	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-15 09:08:57.619	71	Manual History Log	2025-12-01	PAID	\N	\N
15	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 12:12:35.144	67.85	Manual History Log	2025-12-01	PAID	\N	\N
5	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 12:12:46.175	506.7		2025-12-01	PAID	\N	\N
28	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 12:13:08.432	439.94	Manual History Log	2025-12-01	PAID	\N	\N
37	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 12:13:24.271	2785.95	Manual History Log	2025-12-01	PAID	\N	\N
16	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-14 22:40:13.813	360	Manual History Log	2025-12-01	PAID	\N	\N
18	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-14 22:41:47.08	1200.03	Manual History Log	2025-11-01	PAID	\N	\N
19	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-14 22:41:52.349	1142.55	Manual History Log	2025-10-01	PAID	\N	\N
21	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-14 22:43:08.447	85.01	Manual History Log	2025-11-01	PAID	\N	\N
22	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-14 22:43:12.306	85.01	Manual History Log	2025-10-01	PAID	\N	\N
23	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-14 22:44:41.893	522.11	Manual History Log	2025-11-01	PAID	\N	\N
24	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-14 22:44:52.483	605.43	Manual History Log	2025-10-01	PAID	\N	\N
34	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 12:13:49.786	24215.35	Manual History Log	2025-12-01	PAID	\N	\N
26	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-14 22:57:39.694	388.38	Manual History Log	2025-10-01	PAID	\N	\N
27	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-14 22:57:47.751	361.6	Manual History Log	2025-11-01	PAID	\N	\N
29	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-14 23:42:01.723	1300	Manual History Log	2025-12-01	PAID	\N	\N
30	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-14 23:42:09.965	1300	Manual History Log	2025-11-01	PAID	\N	\N
31	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-14 23:42:23.598	1300	Manual History Log	2025-10-01	PAID	\N	\N
32	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-14 23:42:40.889	6000	Manual History Log	2025-10-01	PAID	\N	\N
33	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-14 23:42:48.517	6000	Manual History Log	2025-11-01	PAID	\N	\N
35	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-14 23:43:33.511	11162.45	Manual History Log	2025-11-01	PAID	\N	\N
36	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-14 23:43:40.429	10000	Manual History Log	2025-10-01	PAID	\N	\N
38	275c6a76-793e-450c-831f-077d1104649a	2026-01-14 23:44:02.953	2785.95	Manual History Log	2025-11-01	PAID	\N	\N
40	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-14 23:44:25.934	1500	Manual History Log	2025-12-01	PAID	\N	\N
41	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-14 23:44:28.898	1500	Manual History Log	2025-11-01	PAID	\N	\N
42	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-14 23:44:31.884	1500	Manual History Log	2025-10-01	PAID	\N	\N
43	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-14 23:44:46.395	1800	Manual History Log	2025-12-01	PAID	\N	\N
44	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-14 23:44:50.579	1800	Manual History Log	2025-11-01	PAID	\N	\N
45	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-14 23:44:57.398	1800	Manual History Log	2025-10-01	PAID	\N	\N
47	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-14 23:45:21.5	360	Manual History Log	2025-11-01	PAID	\N	\N
48	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-14 23:45:24.584	360	Manual History Log	2025-10-01	PAID	\N	\N
50	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 12:13:59.258	10695.33	Manual Payment	2025-12-01	PAID	\N	\N
51	658e0f17-59e9-41db-915c-542ad160faec	2026-01-14 23:49:22.85	10695.33	Manual Payment	2025-11-01	PAID	\N	\N
53	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 00:17:02.106	3032.19	Manual History Log	2025-11-01	PAID	\N	\N
54	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 00:17:05.288	3032.19	Manual History Log	2025-10-01	PAID	\N	\N
55	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 00:18:27.545	67.85	Manual History Log	2025-10-01	PAID	\N	\N
59	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 09:36:21.842	347.5	Manual History Log	2025-10-01	PAID	\N	\N
60	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 09:37:14.901	19099.85	Manual History Log	2025-10-01	PAID	\N	\N
61	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 09:37:24.949	10695.33	Manual History Log	2025-10-01	PAID	\N	\N
62	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-15 09:37:37.488	71	Manual History Log	2025-11-01	PAID	\N	\N
63	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-15 09:37:40.433	71	Manual History Log	2025-10-01	PAID	\N	\N
64	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-15 10:05:29.937051	1300	Bulk Import	2025-08-01	PAID	\N	\N
65	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-15 10:05:29.94159	1300	Bulk Import	2025-09-01	PAID	\N	\N
13	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:29:44.736	67.85	Manual History Log	2025-11-01	PAID	\N	\N
14	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:29:52.749	67.85	Manual History Log	2025-09-01	PAID	\N	\N
57	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 12:14:10.655	19099.85	Manual Payment	2025-12-01	PAID	\N	\N
70	6112fce4-57d7-4454-8071-f812287137d5	2026-01-15 10:34:17.555764	3032.19	Bulk Import	2025-07-01	PAID	\N	\N
75	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.576117	1800	Bulk Import	2025-01-01	PAID	\N	\N
76	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.579245	1800	Bulk Import	2025-02-01	PAID	\N	\N
77	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.58288	1800	Bulk Import	2025-03-01	PAID	\N	\N
78	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.586305	1800	Bulk Import	2025-04-01	PAID	\N	\N
79	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.589482	1800	Bulk Import	2025-05-01	PAID	\N	\N
80	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.592703	1800	Bulk Import	2025-06-01	PAID	\N	\N
81	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.595921	1800	Bulk Import	2025-07-01	PAID	\N	\N
82	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.59903	1800	Bulk Import	2025-08-01	PAID	\N	\N
338	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 18:01:17.896	3200	Manual Payment	2025-01-01	PAID	\N	\N
17	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 19:37:19.84	1200.03		2025-12-01	PAID	\N	\N
83	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-15 10:34:17.602165	1800	Bulk Import	2025-09-01	PAID	\N	\N
88	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.619774	2000	Bulk Import	2025-08-01	PAID	\N	\N
93	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.636738	1500	Bulk Import	2025-04-01	PAID	\N	\N
98	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.65355	67.85	Bulk Import	2025-02-01	PAID	\N	\N
103	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.670456	68.14	Bulk Import	2025-07-01	PAID	\N	\N
108	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.686601	937.08	Bulk Import	2025-03-01	PAID	\N	\N
113	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.703673	1067.06	Bulk Import	2025-08-01	PAID	\N	\N
118	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.720535	360	Bulk Import	2025-04-01	PAID	\N	\N
123	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.736652	360	Bulk Import	2025-09-01	PAID	\N	\N
128	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.752515	132.09	Bulk Import	2025-05-01	PAID	\N	\N
133	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.769088	881.68	Bulk Import	2025-01-01	PAID	\N	\N
138	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.785965	2240.49	Bulk Import	2025-06-01	PAID	\N	\N
143	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.802588	21.62	Bulk Import	2025-02-01	PAID	\N	\N
148	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.819784	1011.12	Bulk Import	2025-07-01	PAID	\N	\N
153	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.8365	4604.65	Bulk Import	2025-03-01	PAID	\N	\N
158	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.853047	4466.5	Bulk Import	2025-08-01	PAID	\N	\N
163	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.869068	10695.33	Bulk Import	2025-01-01	PAID	\N	\N
168	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.885135	10695.33	Bulk Import	2025-06-01	PAID	\N	\N
173	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.900684	19099.85	Bulk Import	2025-02-01	PAID	\N	\N
178	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.91638	19099.85	Bulk Import	2025-07-01	PAID	\N	\N
302	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.783884	4000	Bulk Import	2025-02-01	PAID	\N	\N
307	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.80345	5000	Bulk Import	2025-07-01	PAID	\N	\N
339	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 19:26:44.22	1095.43	Manual Payment	2025-12-01	PAID	\N	\N
84	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.605425	1800	Bulk Import	2025-04-01	PAID	\N	\N
89	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.623176	1800	Bulk Import	2025-09-01	PAID	\N	\N
94	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.639879	1500	Bulk Import	2025-05-01	PAID	\N	\N
99	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.657331	67.85	Bulk Import	2025-03-01	PAID	\N	\N
104	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.67371	67.85	Bulk Import	2025-08-01	PAID	\N	\N
109	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.689883	949.44	Bulk Import	2025-04-01	PAID	\N	\N
114	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.707141	1194.54	Bulk Import	2025-09-01	PAID	\N	\N
119	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.723787	360	Bulk Import	2025-05-01	PAID	\N	\N
124	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.739749	85.01	Bulk Import	2025-01-01	PAID	\N	\N
129	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.75581	85.01	Bulk Import	2025-06-01	PAID	\N	\N
134	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.772389	575.83	Bulk Import	2025-02-01	PAID	\N	\N
139	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.78924	2431.59	Bulk Import	2025-07-01	PAID	\N	\N
144	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.805946	43.04	Bulk Import	2025-03-01	PAID	\N	\N
149	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.823129	591.61	Bulk Import	2025-08-01	PAID	\N	\N
154	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.839825	4600	Bulk Import	2025-04-01	PAID	\N	\N
159	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.856319	4466.5	Bulk Import	2025-09-01	PAID	\N	\N
164	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.872222	10695.33	Bulk Import	2025-02-01	PAID	\N	\N
169	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.888175	10695.33	Bulk Import	2025-07-01	PAID	\N	\N
174	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.903806	19099.85	Bulk Import	2025-03-01	PAID	\N	\N
179	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.919517	19099.85	Bulk Import	2025-08-01	PAID	\N	\N
303	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.788212	4000	Bulk Import	2025-03-01	PAID	\N	\N
308	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.80717	5000	Bulk Import	2025-08-01	PAID	\N	\N
85	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.60948	1875	Bulk Import	2025-05-01	PAID	\N	\N
95	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.643602	1500	Bulk Import	2025-06-01	PAID	\N	\N
100	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.660728	68.14	Bulk Import	2025-04-01	PAID	\N	\N
304	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.791941	4000	Bulk Import	2025-04-01	PAID	\N	\N
110	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.69326	991.59	Bulk Import	2025-05-01	PAID	\N	\N
115	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.710629	306	Bulk Import	2025-01-01	PAID	\N	\N
120	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.72699	360	Bulk Import	2025-06-01	PAID	\N	\N
125	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.742932	85.01	Bulk Import	2025-02-01	PAID	\N	\N
130	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.75926	85.01	Bulk Import	2025-07-01	PAID	\N	\N
135	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.775764	744	Bulk Import	2025-03-01	PAID	\N	\N
140	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.792515	2035.33	Bulk Import	2025-08-01	PAID	\N	\N
145	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.809451	125.19	Bulk Import	2025-04-01	PAID	\N	\N
150	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.826469	402.1	Bulk Import	2025-09-01	PAID	\N	\N
155	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.843192	4555.67	Bulk Import	2025-05-01	PAID	\N	\N
160	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 10:34:17.859573	10000	Bulk Import	2025-07-01	PAID	\N	\N
165	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.875291	10695.33	Bulk Import	2025-03-01	PAID	\N	\N
170	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.891227	10695.33	Bulk Import	2025-08-01	PAID	\N	\N
175	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.90696	19099.85	Bulk Import	2025-04-01	PAID	\N	\N
180	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.922698	19099.85	Bulk Import	2025-09-01	PAID	\N	\N
309	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.810771	5000	Bulk Import	2025-09-01	PAID	\N	\N
312	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 11:32:08.468	1200	Manual History Log	2025-09-01	PAID	\N	\N
347	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-18 14:44:32.322	1200.03	Budgeted Amount	2026-01-01	BUDGET	\N	\N
86	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.612974	1875	Bulk Import	2025-06-01	PAID	\N	\N
91	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.630133	1500	Bulk Import	2025-02-01	PAID	\N	\N
96	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.647236	1500	Bulk Import	2025-07-01	PAID	\N	\N
101	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.663907	67.85	Bulk Import	2025-05-01	PAID	\N	\N
106	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.680105	934.09	Bulk Import	2025-01-01	PAID	\N	\N
111	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.69679	934.09	Bulk Import	2025-06-01	PAID	\N	\N
116	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.714096	306	Bulk Import	2025-02-01	PAID	\N	\N
121	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.730226	360	Bulk Import	2025-07-01	PAID	\N	\N
126	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.746088	85.01	Bulk Import	2025-03-01	PAID	\N	\N
131	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.762532	85.01	Bulk Import	2025-08-01	PAID	\N	\N
136	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.779067	1183.11	Bulk Import	2025-04-01	PAID	\N	\N
141	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.795901	1130.36	Bulk Import	2025-09-01	PAID	\N	\N
146	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.812918	132.09	Bulk Import	2025-05-01	PAID	\N	\N
151	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.829935	4663.96	Bulk Import	2025-01-01	PAID	\N	\N
156	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.846417	4695.51	Bulk Import	2025-06-01	PAID	\N	\N
161	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 10:34:17.862763	10000	Bulk Import	2025-08-01	PAID	\N	\N
166	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.878738	10695.33	Bulk Import	2025-04-01	PAID	\N	\N
171	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.894461	10695.33	Bulk Import	2025-09-01	PAID	\N	\N
176	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.91002	19099.85	Bulk Import	2025-05-01	PAID	\N	\N
305	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-15 10:54:29.795858	4000	Bulk Import	2025-05-01	PAID	\N	\N
87	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-15 10:34:17.616428	1875	Bulk Import	2025-07-01	PAID	\N	\N
92	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-15 10:34:17.633523	1500	Bulk Import	2025-03-01	PAID	\N	\N
97	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.650399	67.85	Bulk Import	2025-01-01	PAID	\N	\N
102	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-15 10:34:17.667163	69.58	Bulk Import	2025-06-01	PAID	\N	\N
107	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.683383	938.69	Bulk Import	2025-02-01	PAID	\N	\N
112	6e80c418-0538-45d8-ad3c-3fcb62207e93	2026-01-15 10:34:17.700365	934.09	Bulk Import	2025-07-01	PAID	\N	\N
117	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.717405	306	Bulk Import	2025-03-01	PAID	\N	\N
122	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-15 10:34:17.733474	360	Bulk Import	2025-08-01	PAID	\N	\N
127	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.749355	85.01	Bulk Import	2025-04-01	PAID	\N	\N
132	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-15 10:34:17.765882	85.01	Bulk Import	2025-09-01	PAID	\N	\N
137	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-15 10:34:17.782455	1846.76	Bulk Import	2025-05-01	PAID	\N	\N
142	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.799262	24.2	Bulk Import	2025-01-01	PAID	\N	\N
147	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-15 10:34:17.816317	582.85	Bulk Import	2025-06-01	PAID	\N	\N
152	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.833201	4663.96	Bulk Import	2025-02-01	PAID	\N	\N
157	275c6a76-793e-450c-831f-077d1104649a	2026-01-15 10:34:17.849769	4561.51	Bulk Import	2025-07-01	PAID	\N	\N
162	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-15 10:34:17.865868	10000	Bulk Import	2025-09-01	PAID	\N	\N
167	658e0f17-59e9-41db-915c-542ad160faec	2026-01-15 10:34:17.881887	10695.33	Bulk Import	2025-05-01	PAID	\N	\N
172	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.897531	19099.85	Bulk Import	2025-01-01	PAID	\N	\N
177	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-15 10:34:17.913136	19099.85	Bulk Import	2025-06-01	PAID	\N	\N
310	5f9d5e50-9dc2-4734-b963-e851c6c83c76	2026-01-15 11:30:29.353	1500	Manual Payment	2025-12-01	PAID	\N	\N
229	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 11:53:32.18	530.77	Bulk Import	2025-04-01	PAID	\N	\N
226	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.816842	307.62	Bulk Import	2025-01-01	PAID	\N	\N
227	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.82019	345	Bulk Import	2025-02-01	PAID	\N	\N
228	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.823434	549.43	Bulk Import	2025-03-01	PAID	\N	\N
230	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.830323	304.51	Bulk Import	2025-05-01	PAID	\N	\N
231	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.833714	304.51	Bulk Import	2025-06-01	PAID	\N	\N
232	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.837066	304.51	Bulk Import	2025-07-01	PAID	\N	\N
233	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.840278	304.51	Bulk Import	2025-08-01	PAID	\N	\N
234	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-15 10:38:28.84341	347.5	Bulk Import	2025-09-01	PAID	\N	\N
357	b98bcaf8-7600-4f47-b6f3-1076a7d6cb16	2026-01-18 14:44:02.119	1800	Budgeted Amount	2026-01-01	BUDGET	\N	\N
356	573630a7-dce3-40a7-b54f-b97d021c1503	2026-01-18 14:42:40.952	71	Budgeted Amount	2026-01-01	BUDGET	\N	\N
350	5f9d5e50-9dc2-4734-b963-e851c6c83c76	2026-01-18 14:43:47.951	1500	Budgeted Amount	2026-01-01	BUDGET	\N	\N
349	948d3bf9-31a7-4349-ac52-a780cc99bf8f	2026-01-18 14:45:37.352	22871.84	Budgeted Amount	2026-01-01	BUDGET	\N	\N
346	275c6a76-793e-450c-831f-077d1104649a	2026-01-18 14:45:41.397	5763.22	Budgeted Amount	2026-01-01	BUDGET	\N	\N
355	7094977d-6a1b-4b66-8ac3-d64e9d9fbe29	2026-01-18 14:43:52.406	1500	Budgeted Amount	2026-01-01	BUDGET	\N	\N
359	8c36ac6b-6ae4-4d02-b242-a33ab12c9fec	2026-01-18 14:44:23.035	439.94	Budgeted Amount	2026-01-01	BUDGET	\N	\N
352	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-17 22:11:18.901	0	Draft Amount	2025-12-01	BUDGET	\N	\N
358	e4759a70-0dca-43db-929f-95aa619440b6	2026-01-18 14:44:18.619	1300	Budgeted Amount	2026-01-01	BUDGET	\N	\N
360	05c34fbc-3023-4965-aeec-feea39c5cd5f	2026-01-18 14:44:37.99	85.01	Budgeted Amount	2026-01-01	BUDGET	\N	\N
361	17a08cb1-1624-459f-99fa-b8a14cdd5ff0	2026-01-18 14:44:50.622	506.7	Budgeted Amount	2026-01-01	BUDGET	\N	\N
348	5805b7a5-eb19-4238-9efb-33332feff070	2026-01-18 14:44:46.33	360	Budgeted Amount	2026-01-01	BUDGET	\N	\N
362	07ee8383-65f7-4419-add2-db66b67f97d8	2026-01-18 14:44:54.688	67.85	Budgeted Amount	2026-01-01	BUDGET	\N	\N
363	afcc7a13-64b9-4e41-8716-0ce2e0b57a34	2026-01-18 14:44:58.979	1095.43	Budgeted Amount	2026-01-01	BUDGET	\N	\N
364	6112fce4-57d7-4454-8071-f812287137d5	2026-01-18 14:45:08.344	3032.19	Budgeted Amount	2026-01-01	BUDGET	\N	\N
365	7672d5fb-c564-4aac-9d31-239d1112c60d	2026-01-18 14:45:13.984	6000	Budgeted Amount	2026-01-01	BUDGET	\N	\N
366	df740791-f777-43ad-81b4-6a2284b5c129	2026-01-18 14:45:23.773	19099.85	Budgeted Amount	2026-01-01	BUDGET	\N	\N
367	658e0f17-59e9-41db-915c-542ad160faec	2026-01-18 14:45:27.851	10695.33	Budgeted Amount	2026-01-01	BUDGET	\N	\N
368	40ea5e71-48ce-4bbb-945b-b83c546b8f26	2026-01-19 02:31:08.921	10000	Budgeted Amount	2026-01-01	BUDGET	\N	\N
369	40ea5e71-48ce-4bbb-945b-b83c546b8f26	2026-01-21 18:52:37.564	0	Budgeted Amount	2025-12-01	BUDGET	\N	\N
370	3925eec8-28e8-4f40-8478-c0eb8752d83c	2026-01-21 23:21:35.288	18	Budgeted Amount	2026-01-01	BUDGET	\N	\N
371	996098cb-7a1f-4b68-afe4-6fa38cb0d4c2	2026-01-21 23:21:48.994	54.55	Budgeted Amount	2026-01-01	BUDGET	\N	\N
372	6ad25cce-5c21-4d3f-b773-960c3cdea7b1	2026-01-21 23:21:53.929	12.99	Budgeted Amount	2026-01-01	BUDGET	\N	\N
351	a738bf0a-7e9b-4cb9-b16d-11d9f695cf89	2026-01-22 23:44:27.549	0	Budgeted Amount	2026-01-01	BUDGET	\N	\N
\.


--
-- Data for Name: raw_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.raw_messages (id, sender, body, "timestamp", status, error_log) FROM stdin;
5d53dafe-1391-4db2-b892-66a6a6f19415	Telegram-Channel_-1003635708322	OTP Code:3894\nReason:Local Transfer - Mobile App\nAmount:350.00 SAR	2026-01-22 03:42:29.722508	PARSED	\N
da9d4579-dd8c-43e2-b49e-6f94e58a4d51	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-22 03:49:01.726951	PARSED	\N
9e720e5e-bda4-44a6-bba3-d0f8999617e3	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 0.04\nTo: 1505\n26/1/22 13:46	2026-01-22 13:46:41.363773	PARSED	\N
7dadebb2-129a-4b3f-b2d7-358d40fe6117	Telegram-Channel_-1003635708322	Online Purchase\nCard:7868 ;Visa\nAmount:31.29 USD\nAt: ADOBE *8\nCountry:USA\nBalance:3.73 USD\nDate:06-01-2026 14:59	2026-01-22 14:02:07.066555	PARSED	\N
99b236ce-864f-4f11-82d9-4fb5a10f04aa	Telegram-Channel_-1003635708322	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : SAR 71\nMerchant : NETFLIX.C\nDate : 22/1/26 17:40	2026-01-22 17:40:53.762025	PARSED	Transaction Declined (Not added to ledger)
c97958eb-b951-4d81-b523-100c809610f2	Telegram-Channel_-1003635708322	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-22 18:51 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	2026-01-22 18:51:52.926899	PARSED	\N
bedc7a7c-233f-45ab-8937-3a1d597e1492	Telegram-Channel_-1003635708322	One Time Password\nCode: 5565\nReason: To Transfer Via Instant Payment Service\nBeneficiary: MYACCRAJHI\nAmount: 1000.00 SAR\nDate: 2026-01-22 20:34	2026-01-22 20:34:13.070435	PARSED	\N
fae7019a-0d09-46cd-b664-200ff65b1c87	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-22 20:34:35.897088	PARSED	\N
7485bd5f-f27a-4c6f-be0f-8e9386803b46	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-22 20:34:46.303273	PARSED	\N
83a5f58d-aa04-47d8-a6f3-d76afa27ea65	Telegram-Channel_-1003635708322	OTP Code:6238\nReason:Rajhi Transfer - Mobile App\nAmount:540.00 SAR	2026-01-22 20:43:21.807994	PARSED	\N
4b98000a-3222-4bae-b2f5-7a0d39525dbd	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 540\nTo:MOHAMMED ISLAM\nTo:0477\n26/1/22 20:43	2026-01-22 20:43:32.024228	PARSED	\N
4d5fd86d-41c2-4128-a8db-e0e0e7b22816	Telegram-Channel_-1003635708322	OTP Code:9957\nReason:Rajhi Transfer - Mobile App\nAmount:250.00 SAR	2026-01-22 21:03:08.474436	PARSED	\N
86986e08-67aa-463a-b6ae-e5c76bcb0e15	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-22 21:03:21.28021	PARSED	\N
04199164-e787-4b4c-a7a1-c721f3c2ec56	Telegram-Channel_-1003635708322	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Back comfort trading comp \nof: 1263.80 SAR \non : 2026-01-22 22:06 \nAvailable Balance: 21839.24 SAR \nDue Amount: 51896.96 SAR	2026-01-22 22:06:50.269952	PARSED	\N
22aefb59-cd80-4f35-8287-18740ac0c2e0	Telegram-Channel_-1003635708322	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :URTH CAFFE KAFD \nof: 86.00 SAR \non : 2026-01-22 22:46 \nAvailable Balance: 21753.24 SAR \nDue Amount: 51896.96 SAR	2026-01-22 22:46:21.39226	PARSED	\N
a19b467c-8a7a-46ea-81e9-e42011649611	Telegram-Channel_-1003635708322	Online Purchase Apple Pay Credit Card: 4897 at :q-Rowleys of : 683.90 SAR on : 2026-01-23 00:37 Available Balance is: 21069.34 SAR Due Amount: 51896.96 SAR	2026-01-23 00:37:53.952787	PARSED	\N
783c794c-2c98-4112-8bc8-0dd51df0879e	Telegram-Channel_-1003635708322	Notification : Declined due to insufficient fund\nTransaction : Online Purchase\nCard: 7868\nAmount : USD 14.99\nMerchant : AMAZON PR\nDate : 23/1/26 4:51	2026-01-23 04:51:30.604329	FAILED	400 API key expired. Please renew the API key. [reason: "API_KEY_INVALID"\ndomain: "googleapis.com"\nmetadata {\n  key: "service"\n  value: "generativelanguage.googleapis.com"\n}\n, locale: "en-US"\nmessage: "API key expired. Please renew the API key."\n]
5b48d943-100f-4e1a-8e80-ee8b0e0bb821	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 11:40:19.429998	FAILED	400 API key expired. Please renew the API key. [reason: "API_KEY_INVALID"\ndomain: "googleapis.com"\nmetadata {\n  key: "service"\n  value: "generativelanguage.googleapis.com"\n}\n, locale: "en-US"\nmessage: "API key expired. Please renew the API key."\n]
36d56d40-4060-4696-a871-071b1190cf30	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 11:48:50.473918	FAILED	400 API key expired. Please renew the API key. [reason: "API_KEY_INVALID"\ndomain: "googleapis.com"\nmetadata {\n  key: "service"\n  value: "generativelanguage.googleapis.com"\n}\n, locale: "en-US"\nmessage: "API key expired. Please renew the API key."\n]
47dc4610-2d86-4c25-8cee-430433c79611	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 12:41:19.435475	PARSED	\N
5162bf23-393a-4a41-914d-875f4ea79fc2	Telegram-Channel_-1003635708322	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	2026-01-23 13:17:01.418756	PARSED	\N
43e7ac4a-6db3-4e8d-bdca-914f6173b704	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:17:32.178759	PARSED	\N
7da9f9e7-5dba-4223-a725-7eba6fd1b1d0	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:22:51.553784	PARSED	\N
29acca33-bdfb-4492-a73d-0a9d127aca79	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:31:54.306698	PARSED	\N
e796d7c0-a1eb-41f3-a88e-244e1c73cd49	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:33:54.212196	PARSED	\N
a9dedd4b-2e21-4787-bc35-cb1daf49386b	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:40:44.987392	PARSED	\N
3abf1105-51b8-4a0a-af62-f9c89f485daa	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:42:18.536146	PARSED	\N
fe9e4570-224c-4ad8-a452-0cbe9d0aaafe	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:49:15.266321	PARSED	\N
9ec3d04d-6dd4-4dde-ba49-07198e685369	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:50:42.67404	PARSED	\N
cee58ef8-02d2-4160-bccc-d22455630b3d	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:55:02.844837	PARSED	\N
af46148f-5282-420a-ada2-8f6a8c235d57	Telegram-Channel_-1003635708322	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	2026-01-23 13:59:01.904362	PARSED	\N
238396de-adf2-42d9-bd8c-6774d5d524b8	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:00:00.965521	PARSED	\N
041b6b0d-3c28-499b-888e-aa00a1207190	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 14:01:37.560338	PARSED	\N
977e9b11-a2d9-4ed8-93c5-dc0166d17103	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:02:18.203885	PARSED	\N
08ba11d3-1b05-4ba6-b3ed-32d3679adbee	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 14:10:11.736961	PARSED	\N
3d7be69c-55bf-40e2-a4f7-bc1780750efe	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:10:56.146652	PARSED	\N
794b0404-c5ce-449f-93a4-bdbcd58d8563	Telegram-Channel_-1003635708322	Disliked “Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021”	2026-01-23 14:14:32.972378	PARSED	\N
72f6567e-9e89-4be5-8102-6b3b67905e10	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 14:14:36.11296	PARSED	\N
7168cb4b-c24f-4680-bd11-886df8f0450d	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 14:14:55.018881	PARSED	\N
dd88a1bf-1849-44bc-a920-fd8d9515f9e3	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 52\nAt:FUTURE ID\n23/1/26 17:51	2026-01-23 17:51:42.650677	PARSED	\N
787c14a6-9bf0-4c26-ba76-499a7fe21acd	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 8\nAt:FUTURE ID\n23/1/26 17:55	2026-01-23 17:55:36.533613	PARSED	\N
8ac5f283-bddc-4588-bfab-016afc6a9fd2	Telegram-Channel_-1003635708322	Credit Transfer Internal\nAmount:SAR 500\nTo:7772\nFrom:ABDULRHMAN ALASIRI\nFrom:1998\n26/1/23 19:19	2026-01-23 19:20:00.578891	PARSED	\N
44d7d6ef-19d3-413c-8666-4222789012ac	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:23:39.601653	PARSED	\N
4846a5a0-d116-48d8-8d2d-0490bd918403	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-23 19:24:26.972151	PARSED	\N
0b36910f-6500-4d47-a6e0-6ee792828d0b	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:48:02.615335	PARSED	\N
fb820c59-6283-45f0-83f4-ed5ccc00e051	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:48:39.666959	PARSED	\N
ef0491fb-783a-4b4c-a839-e999ee243b84	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-23 19:50:41.684812	PARSED	\N
c8f4930d-2dc2-4a69-8a48-2beb2ecf981d	Telegram-Channel_-1003635708322	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 44\nAt:Sasco Pal\n24/1/26 20:38	2026-01-23 20:38:27.900705	PARSED	\N
7a7995b0-fe93-42a3-9fcf-2af31fc1157d	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-24 01:18:07.175382	PARSED	\N
f4be4c7f-59bd-44a5-bacd-431316d56290	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	2026-01-24 01:18:55.683329	PARSED	\N
93da7376-6cf1-48b7-960f-42983bcbc94a	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	2026-01-24 01:19:29.620773	PENDING	\N
b6d7a1f6-a472-4d7d-899f-2cdc1f20a138	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:21\nRef: 2BTMS12034841021	2026-01-24 01:21:39.99036	PARSED	\N
45191a70-7b31-460e-8d8b-be3cbb56e2ba	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:21	2026-01-24 01:22:06.041907	PENDING	\N
6094d1ce-b8f1-411b-88d3-3ea3f44cc251	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	2026-01-24 01:34:32.612616	PENDING	\N
48d2580a-52a9-4ac6-827b-4848dfd8aab5	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	2026-01-24 01:34:54.531602	PENDING	\N
f82d6a8a-2f9f-4805-8d60-751b9b90f5ca	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	2026-01-24 01:39:42.005677	PARSED	\N
349caa68-cc8f-4d62-9ce7-18f92df648aa	Telegram-Channel_-1003635708322	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:46\nRef: 2BTMS12034841021	2026-01-24 01:47:14.363049	PARSED	\N
5e7d8f05-0724-4ea0-a24e-6af94fb5a885	Telegram-Channel_-1003635708322	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:47	2026-01-24 01:47:39.099658	PARSED	\N
5c65c2ea-8bf3-4e61-b812-7f6e0bb5e347	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1000\nTo: 1505\n26/1/24 1:49	2026-01-24 01:49:59.213256	PARSED	\N
679d4540-d5d2-48c6-9c06-e62c3240736e	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 01:51:45.504214	PARSED	\N
63c854bc-6cb0-4648-8361-a4045161642d	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 01:58:23.863944	PARSED	\N
ced853e6-1376-432d-a018-564479b3846c	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 02:04:04.857782	PARSED	\N
8a6122d8-f60c-4b1a-9589-905cdbf0e691	Telegram-Channel_-1003635708322	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-24 02:13 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	2026-01-24 02:13:11.906466	PARSED	\N
0312f2ce-f638-4b43-a993-faf1d70692de	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	2026-01-24 02:19:53.749286	PARSED	\N
71ab1ef6-136d-43f4-85a5-1a4b567d54d2	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1500\nTo: 1505\n26/1/24 2:19	2026-01-24 02:21:05.02235	PARSED	\N
b0a87174-f6ca-4115-93b0-2ce931d31bc9	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:27	2026-01-24 02:27:28.08365	PARSED	\N
48c98c97-c6cc-4cb1-a732-7c3b2f5bce41	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:31	2026-01-24 02:31:24.192041	PARSED	\N
db22bbd2-3473-4cbc-bd48-f5d21fbcfa3e	Telegram-Channel_-1003635708322	AlRajhiBankTransfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:38	2026-01-24 02:38:45.846842	PARSED	\N
fd4a6e57-5081-4a8c-b316-08efa511efe9	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 03:00:56.755268	PARSED	\N
5b48e13d-8f34-400a-983d-6909639e39aa	Telegram-Channel_-1003635708322	Sender: AlrajhiBank\nTransfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19	2026-01-24 03:03:45.143569	PARSED	\N
a7ff96ca-15e0-4800-b639-5262d092acbf	Telegram-Channel_-1003635708322	AlrajhiBank\nTransfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19	2026-01-24 03:03:59.479092	PARSED	\N
343eb940-1d26-4095-a13b-c866343bc94e	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 03:09:10.020979	PARSED	\N
07d72d58-1693-4113-8930-da4ea8135ede	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 03:09:44.8728	PARSED	\N
a3c5aaba-4a17-42db-89eb-e11141a976ac	Telegram-Channel_-1003635708322	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Tabby \nof: 614.21 SAR \non : 2026-01-24 05:53 \nAvailable Balance: 20455.13 SAR \nDue Amount: 51896.96 SARJazira Bank	2026-01-24 05:53:09.526345	PARSED	\N
6993cbc9-b1b4-40f7-9c9a-868db7f0295b	Telegram-Channel_-1003635708322	Transfer Between Your Accounts\nAmount: SAR 122\nTo: 1505\n26/1/24 2:19+966566985112	2026-01-24 10:54:23.133793	PARSED	\N
\.


--
-- Data for Name: savings_goals; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.savings_goals (id, name, target_amount, current_amount, target_date, icon, color) FROM stdin;
\.


--
-- Data for Name: training_examples; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.training_examples (id, raw_text, parsed_json, created_at) FROM stdin;
d480e172-eadf-4cbc-9b01-8411b8b87d7b	Transfer Between Your Accounts\nAmount: SAR 31.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 31.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:22:09.37947
2c329c92-3943-4fd7-ace7-75526ee324b2	Transfer Between Your Accounts\nAmount: SAR 31.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 31.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:24:36.526969
e8d9210f-0236-48f4-809e-b4c3be23636f	Transfer Between Your Accounts\nAmount: SAR 11.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 11.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:45:53.85856
a5b24645-20d5-4850-a8ff-d5cdc47cbf73	Transfer Between Your Accounts\nAmount: SAR 112.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 112.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:46:26.299198
42e266b0-a67b-4b2f-b0ff-fa5bb31b8d70	Transfer Between Your Accounts\nAmount: SAR 122.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 122.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:47:17.38358
53ccb8e2-a693-4108-a457-eef330b55297	Transfer Between Your Accounts\nAmount: SAR 152.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 152.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:50:58.477747
bab7e4d1-6551-4b72-a8de-c091275dff1d	Transfer Between Your Accounts\nAmount: SAR 11.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 11.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:53:45.686604
396cb612-f0f5-4f69-bd39-b5a21764ca93	Transfer Between Your Accounts\nAmount: SAR 21.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 21.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:54:41.609865
809efc53-4414-4f21-bd51-46719ea78ef0	Transfer Between Your Accounts\nAmount: SAR 162.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 162.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 21:58:45.077534
2c55a7e2-d9bf-454a-b409-9c3b73aeecd2	Transfer Between Your Accounts\nAmount: SAR 162.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 162.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 22:05:26.812461
019ec11f-808b-47a5-9383-3309d14d13d2	Transfer Between Your Accounts\nAmount: SAR 102.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 102.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-21 22:07:11.569233
095b0f22-629a-42a6-a149-179398a32884	Transfer Between Your Accounts\nAmount: SAR 112.34\nTo: 1505\n26/1/20 14:52	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 112.34, "currency": "SAR", "date": "2026-01-26", "time": "14:52", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 02:06:41.811937
656b0c4c-fd7b-48a4-a2a3-3dad2f70eab7	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 7\nAt:GOT COOKI\n19/1/26 13:33	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "GOT COOKI", "brand_name": "GOT COOKI", "amount": 7.0, "currency": "SAR", "date": "2026-01-19", "time": "13:33", "category": "Food", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 02:48:46.929222
040504a7-f560-4278-8d52-19db22b7bf2b	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 97\nAt:Five Guys\n12/1/26 13:47	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Five Guys", "brand_name": "Five Guys", "amount": 97.0, "currency": "SAR", "date": "2026-01-12", "time": "13:47", "category": "Food", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 02:50:54.077535
ff277145-96b8-4ec3-babb-10b028ac9489	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 95\nAt:Five Guys\n12/1/26 13:47	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Five Guys", "brand_name": "Five Guys", "amount": 95.0, "currency": "SAR", "date": "2026-01-12", "time": "13:47", "category": "Food", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-22 02:53:22.5861
1611aa62-d50a-4ae9-b6db-71f0105d21cc	OTP Code:3894\nReason:Local Transfer - Mobile App\nAmount:350.00 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "Local Transfer - Mobile App", "brand_name": null, "amount": 350.0, "currency": "SAR", "date": "2026-01-22", "time": null, "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 03:42:32.401445
d47ef412-57e0-4e72-8f91-7c7743db0bc9	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-22 03:49:03.628553
01540c06-8192-4179-9c54-2a2255f86dda	Transfer Between Your Accounts\nAmount: SAR 0.04\nTo: 1505\n26/1/22 13:46	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "1505", "brand_name": null, "amount": 0.04, "currency": "SAR", "date": "2026-01-22", "time": "13:46", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 13:46:43.541264
4ce856d4-9981-442a-92a7-52ac54921476	Online Purchase\nCard:7868 ;Visa\nAmount:31.29 USD\nAt: ADOBE *8\nCountry:USA\nBalance:3.73 USD\nDate:06-01-2026 14:59	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "ADOBE *8", "brand_name": "Adobe", "amount": 31.29, "currency": "USD", "date": "2026-01-06", "time": "14:59", "category": "Other", "source_account_last4": "7868", "destination_account_last4": null, "status": "success"}	2026-01-22 14:02:09.521705
3aaa9902-7b89-43dd-b874-c5422cc3b865	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-22 18:51 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "purchase", "merchant": "Amazon.sa", "brand_name": "Amazon", "amount": 1.0, "currency": "SAR", "date": "2026-01-22", "time": "18:51", "category": "Other", "source_account_last4": "1645", "destination_account_last4": null, "status": "success"}	2026-01-22 18:51:54.946829
02a6aa7e-3aff-41af-bdc1-42f14363a692	One Time Password\nCode: 5565\nReason: To Transfer Via Instant Payment Service\nBeneficiary: MYACCRAJHI\nAmount: 1000.00 SAR\nDate: 2026-01-22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MYACCRAJHI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 20:34:15.07116
4544dff9-e284-4aa5-a8be-f6e2591e8738	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-22 20:34:37.485489
ef6c65c7-311d-4b2a-92ca-c56d8bc37a7d	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-22 20:34:47.795012
ffd39c27-28b0-4769-9528-da3edfc45d0a	OTP Code:6238\nReason:Rajhi Transfer - Mobile App\nAmount:540.00 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "Rajhi Transfer - Mobile App", "brand_name": null, "amount": 540.0, "currency": "SAR", "date": "2026-01-22", "time": null, "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 20:43:23.799753
29679035-e346-4e13-8833-be16b159eb11	Debit Internal Transfer\nFrom:7772\nAmount:SAR 540\nTo:MOHAMMED ISLAM\nTo:0477\n26/1/22 20:43	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "MOHAMMED ISLAM", "brand_name": null, "amount": 540.0, "currency": "SAR", "date": "2026-01-26", "time": "20:43", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "0477", "status": "success"}	2026-01-22 20:43:33.522208
19f8a8e0-2225-4cc8-bf51-bf2823d1edc5	OTP Code:9957\nReason:Rajhi Transfer - Mobile App\nAmount:250.00 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "Rajhi Transfer - Mobile App", "brand_name": null, "amount": 250.0, "currency": "SAR", "date": "2026-01-22", "time": null, "category": "Transfer", "source_account_last4": null, "destination_account_last4": null, "status": "success"}	2026-01-22 21:03:10.407083
8ce57f16-0f19-4624-bbb8-d31022f05aa7	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "SARAH ALALMAEE", "brand_name": null, "amount": 250.0, "currency": "SAR", "date": "2026-01-26", "time": "21:03", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "2104", "status": "success"}	2026-01-22 21:03:22.817566
5088cebc-991f-4e08-8370-0222223cdb2e	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Back comfort trading comp \nof: 1263.80 SAR \non : 2026-01-22 22:06 \nAvailable Balance: 21839.24 SAR \nDue Amount: 51896.96 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Back comfort trading comp", "brand_name": "Back comfort trading comp", "amount": 1263.8, "currency": "SAR", "date": "2026-01-22", "time": "22:06", "category": "Other", "source_account_last4": "4897", "destination_account_last4": null, "status": "success"}	2026-01-22 22:06:52.301479
57829577-abc6-4006-8d66-ad9302960d02	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :URTH CAFFE KAFD \nof: 86.00 SAR \non : 2026-01-22 22:46 \nAvailable Balance: 21753.24 SAR \nDue Amount: 51896.96 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "URTH CAFFE KAFD", "brand_name": "URTH CAFFE", "amount": 86.0, "currency": "SAR", "date": "2026-01-22", "time": "22:46", "category": "Food", "source_account_last4": "4897", "destination_account_last4": null, "status": "success"}	2026-01-22 22:46:23.911489
e458964b-a1d8-4585-bf6e-684271fb0d6b	Online Purchase Apple Pay Credit Card: 4897 at :q-Rowleys of : 683.90 SAR on : 2026-01-23 00:37 Available Balance is: 21069.34 SAR Due Amount: 51896.96 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "q-Rowleys", "brand_name": "q-Rowleys", "amount": 683.9, "currency": "SAR", "date": "2026-01-23", "time": "00:37", "category": "Other", "source_account_last4": "4897", "destination_account_last4": null, "status": "success"}	2026-01-23 00:37:55.89533
ac81cd93-e0fe-494f-80cc-3c431a572fef	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "SARAH ALALMAEE", "brand_name": null, "amount": 250.0, "currency": "SAR", "date": "2026-01-26", "time": "21:03", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "2104", "status": "success"}	2026-01-23 12:41:21.701792
963248c1-5825-435f-bfc7-7f99b180641a	Debit Internal Transfer\nFrom:7772\nAmount:SAR 250\nTo:SARAH ALALMAEE\nTo:2104\n26/1/22 21:03	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "merchant": "SARAH ALALMAEE", "brand_name": null, "amount": 250.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-26", "time": "21:03", "category": "Transfer", "source_account_last4": "7772", "destination_account_last4": "2104", "status": "success"}	2026-01-23 13:17:04.309006
44dccdc4-f541-4c29-bfa1-61e2cb747524	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:17:34.368135
28067511-1602-4a83-bb86-507593ba45ce	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:22:54.573199
cb2df096-2ef6-4549-b150-5ac5181f7622	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:31:56.506935
c89bc831-c3da-4c8a-881e-33edee139c2d	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:33:56.292324
03784f2f-7756-4ea6-ba4c-83d4f6fc4ea5	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:40:47.605843
7d71f277-7224-4d46-88ff-d77968482db9	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:42:20.67451
5da18c38-d079-4c7d-95e4-5f3983d82ba6	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:49:18.279632
34479090-cfe1-476c-b7cb-e83da2a0f945	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:50:44.587012
3bacb0ef-5b5d-4305-abcb-51128adb52d4	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:55:05.50509
1ab8a718-25cd-44ad-91f0-a38eb354be0a	Debit Transfer Local\nBank:SNB\nFrom:1505\nAmount:SAR 350\nTo:مؤسسة غاردن كير\nTo:7407\nFees:SAR 0.29\n26/1/22 03:48	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "\\u0645\\u0624\\u0633\\u0633\\u0629 \\u063a\\u0627\\u0631\\u062f\\u0646 \\u0643\\u064a\\u0631", "brand_name": null, "amount": 350.0, "currency": "SAR", "fees": 0.29, "date": "2026-01-26", "time": "03:48", "category": "Transfer", "source_account_last4": "1505", "destination_account_last4": "7407", "status": "success"}	2026-01-23 13:59:04.077301
c2e14503-7b9f-4edc-84c7-8698c84ce708	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:00:02.666466
71d1a451-aa6a-475d-b4c9-1499f8893f33	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:01:39.296639
cdea10ed-553f-4222-a037-02f3afbd6143	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:02:19.920027
f3636f62-a34a-40b4-9e1b-9164a4354350	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:10:14.589965
40ec3d27-7905-4472-b9f5-e32066deb446	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:10:57.853947
e17f9616-2a4b-43a2-9f25-d01b7a34f423	Disliked “Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021”	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:14:35.826442
e6e05ef1-0c9f-4179-bdff-b5247978a42d	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 14:14:56.75677
9779e0f5-e80c-4821-a2c9-6ca5d04e0d4e	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 52\nAt:FUTURE ID\n23/1/26 17:51	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "FUTURE ID", "brand_name": "FUTURE ID", "amount": 52.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-23", "time": "17:51", "category": "Unknown", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-23 17:51:45.454666
e9f6f1f0-a10d-4640-bf46-5180b8ffd22e	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 8\nAt:FUTURE ID\n23/1/26 17:55	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "FUTURE ID", "brand_name": "FUTURE ID", "amount": 8.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-23", "time": "17:55", "category": "Unknown", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-23 17:55:38.557795
60365fb2-410b-45b4-b3f9-e886be7bc449	Credit Transfer Internal\nAmount:SAR 500\nTo:7772\nFrom:ABDULRHMAN ALASIRI\nFrom:1998\n26/1/23 19:19	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "ABDULRHMAN ALASIRI", "brand_name": null, "amount": 500.0, "currency": "SAR", "fees": 0.0, "date": "2023-01-26", "time": "19:19", "category": "Transfer", "source_account_last4": "1998", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:20:02.603572
90f2ab50-50cb-4d44-96a5-904c7e8538a1	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:23:41.856246
a2ebc120-fbda-474e-8e6a-bb2d30490599	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1000\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/22 20:34	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "merchant": "MUATH AMER MOHAMMED ALASIRI", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2022-01-26", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:24:28.593873
68ef724b-dc71-4fad-aaa5-cb15d2e465f9	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "merchant": "MUATH ALAS**", "brand_name": null, "amount": 1000.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-22", "time": "20:34", "category": "Transfer", "source_account_last4": "8001", "destination_account_last4": "7772", "status": "success"}	2026-01-23 19:48:41.29742
31ebb415-e83c-4ae2-8aec-4cd8b2aa1a05	PoS\nBy:9365;mada-Apple Pay\nAmount:SAR 44\nAt:Sasco Pal\n24/1/26 20:38	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "merchant": "Sasco Pal", "brand_name": "Sasco Pal", "amount": 44.0, "currency": "SAR", "fees": 0.0, "date": "2026-01-24", "time": "20:38", "category": "Unknown", "source_account_last4": "9365", "destination_account_last4": null, "status": "success"}	2026-01-23 20:38:29.921149
6c3253f3-d229-4bf9-bf47-8c79f04f3683	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1000.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-22 20:34", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:18:10.31535
e8762463-f09e-48de-b97b-727671d7497f	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,000.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-22 20:34\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1000.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-22 20:34", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:18:58.0788
c8cb0235-561b-4aa7-9bb3-46f47b1ed433	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:21\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1200.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 01:21", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:21:41.81897
a76b1285-da7c-4116-b086-2a1d81cd436e	Credit Transfer Local\nVia:BJAZ\nAmount:SAR 1200\nTo:7772\nFrom:MUATH AMER MOHAMMED ALASIRI\nFrom:8001\n26/1/24 1:29	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:29", "available_balance": null, "beneficiary": null, "merchant": "MUATH AMER MOHAMMED ALASIRI", "sender_name": null, "description": "Transfer to Muath"}	2026-01-24 01:39:44.399824
94609472-0629-48d9-93dc-0b2fd717f2ee	Outgoing Funds Transfer Approved\nDebited from Account: 8001\nTo: MUATH ALAS**\nAmount: SAR 1,200.00\nIBAN/Alias: 7772\n[AlRajhi Bank]\nat 2026-01-24 1:46\nRef: 2BTMS12034841021	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "8001", "destination_account_last4": "7772", "card_info": null, "amount": 1200.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 01:46", "available_balance": null, "beneficiary": "MUATH ALAS", "merchant": "MUATH ALAS", "sender_name": null, "description": "Transfer to MUATH ALAS"}	2026-01-24 01:47:16.700022
d5a87712-19f9-4668-85ef-7726af4cc424	Transfer Between Your Accounts\nAmount: SAR 1000\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 1000, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to Expense"}	2026-01-24 01:50:01.144266
533221fd-e736-4d67-a4d8-c686c0f45678	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Internal transfer to Expense (1505)"}	2026-01-24 01:51:47.41106
3ace08e0-77fa-468f-b185-b573944b03be	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Internal Transfer from Expense to 1505"}	2026-01-24 01:58:26.178636
0a017f1b-4e46-4a14-b049-bdd0a90cc674	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to Expense"}	2026-01-24 02:04:07.750202
188228fa-6c13-4bf3-9d58-3f905fc7bff0	Internet Purchase Reversal Credit card : 1645 of : 1.00 SAR At : Amazon.sa on : 2026-01-24 02:13 Available Balance: 12779.76 SAR Due Amount: 32220.24 SAR	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "purchase", "source_bank": "Jazira Bank", "destination_bank": null, "source_account_last4": "1645", "destination_account_last4": null, "card_info": null, "amount": 1.0, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 02:13", "available_balance": 12779.76, "beneficiary": null, "merchant": "Amazon.sa", "sender_name": null, "description": "Internet Purchase Reversal at Amazon.sa"}	2026-01-24 02:13:14.62147
03ae171b-9070-4102-9399-9467fd8435d7	Transfer Between Your Accounts\nAmount: SAR 1200\nTo: 1505\n26/1/24 1:49	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1200, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 01:49", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to Expense"}	2026-01-24 02:19:56.13161
511c52ba-2b6c-4924-8188-2ae24f2a9cd6	Transfer Between Your Accounts\nAmount: SAR 1500\nTo: 1505\n26/1/24 2:19	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1500, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to 1505"}	2026-01-24 02:21:06.808184
c1c04b6b-24f2-4d36-9005-2c226182d5d2	Transfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:27	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "Jazira Bank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:27", "available_balance": null, "beneficiary": null, "merchant": null, "sender_name": null, "description": "Transfer between your accounts"}	2026-01-24 02:27:30.441855
fbe8554c-4e28-4077-b242-da54aec59016	AlRajhiBankTransfer Between Your Accounts\nAmount: SAR 1\nTo: 1505\n26/1/24 02:38	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 1, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:38", "available_balance": null, "beneficiary": null, "merchant": null, "sender_name": null, "description": null}	2026-01-24 02:38:48.561339
6fe2adf8-e85e-40a7-9985-e937e3540e68	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "internal_transfer", "source_bank": "Jazira Bank", "destination_bank": "Jazira Bank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 22.0, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": null, "sender_name": null, "description": null}	2026-01-24 03:00:58.886419
a86964a8-d652-4f7b-962e-8a869950dc9a	Sender: AlrajhiBank\nTransfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": "1505", "destination_account_last4": null, "card_info": null, "amount": 22, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Internal transfer to Expense"}	2026-01-24 03:03:46.915978
a27dda17-5b0c-4807-b1b4-4d18a863db5c	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 22, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to 1505"}	2026-01-24 03:09:46.622408
e0a1f967-a6c7-4e10-8bb5-873d6502270b	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Tabby \nof: 614.21 SAR \non : 2026-01-24 05:53 \nAvailable Balance: 20455.13 SAR \nDue Amount: 51896.96 SARJazira Bank	{"is_financial_event": true, "is_transaction": true, "transaction_type": "debit", "sub_type": "purchase", "source_bank": "Jazira Bank", "destination_bank": null, "source_account_last4": "4897", "destination_account_last4": null, "card_info": null, "amount": 614.21, "currency": "SAR", "fees": null, "timestamp": "2026-01-24 05:53", "available_balance": 20455.13, "beneficiary": null, "merchant": "Tabby", "sender_name": null, "description": "POS Purchase at Tabby"}	2026-01-24 05:53:11.898985
4409801c-4bd7-4408-9130-ba767ed807bd	Transfer Between Your Accounts\nAmount: SAR 122\nTo: 1505\n26/1/24 2:19+966566985112	{"is_financial_event": true, "is_transaction": true, "transaction_type": "credit", "sub_type": "internal_transfer", "source_bank": "AlRajhiBank", "destination_bank": "AlRajhiBank", "source_account_last4": null, "destination_account_last4": "1505", "card_info": null, "amount": 122, "currency": "SAR", "fees": null, "timestamp": "2024-01-26 02:19", "available_balance": null, "beneficiary": null, "merchant": "1505", "sender_name": null, "description": "Transfer to 1505"}	2026-01-24 10:54:25.832318
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, account_id, amount, merchant, "timestamp", raw_sms_content, category, balance_after_transaction, logo_url, type, status, notes, fees, original_amount, original_currency, exchange_rate) FROM stdin;
477621f7-e45c-482d-a36f-d706fe1eb997	0cbe5b34-c256-4a86-a025-84916176468f	22	Transfer from AlRajhiBank	2026-01-24 02:19:00	Transfer Between Your Accounts\nAmount: SAR 22\nTo: 1505\n26/1/24 2:19+966566985112	Transfer	76865.71	\N	credit	completed	\N	0	\N	\N	\N
bce8d164-eb1a-4fa2-af89-1fd1ccbd8010	ca3f031d-7975-46cb-9f89-71bf19fd4d46	614.21	Tabby	2026-01-24 05:53:11.894854	POS Purchase (Apple Pay) \nCredit Card: 4897 \nat :Tabby \nof: 614.21 SAR \non : 2026-01-24 05:53 \nAvailable Balance: 20455.13 SAR \nDue Amount: 51896.96 SARJazira Bank	Uncategorized	19385.79	\N	debit	completed	\N	0	\N	\N	\N
736aaf98-a523-4414-9961-e1991e69f73d	0cbe5b34-c256-4a86-a025-84916176468f	122	Transfer from AlRajhiBank	2026-01-24 02:19:00	Transfer Between Your Accounts\nAmount: SAR 122\nTo: 1505\n26/1/24 2:19+966566985112	Transfer	76987.71	\N	credit	completed	\N	0	\N	\N	\N
\.


--
-- Name: account_aliases_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.account_aliases_id_seq', 9, true);


--
-- Name: obligation_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.obligation_history_id_seq', 372, true);


--
-- Name: account_aliases account_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_aliases
    ADD CONSTRAINT account_aliases_pkey PRIMARY KEY (id);


--
-- Name: account_audits account_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_audits
    ADD CONSTRAINT account_audits_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: allocation_history allocation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_history
    ADD CONSTRAINT allocation_history_pkey PRIMARY KEY (id);


--
-- Name: allocation_rules allocation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.allocation_rules
    ADD CONSTRAINT allocation_rules_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: currency_wallets currency_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.currency_wallets
    ADD CONSTRAINT currency_wallets_pkey PRIMARY KEY (id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: payments obligation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT obligation_history_pkey PRIMARY KEY (id);


--
-- Name: obligations obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.obligations
    ADD CONSTRAINT obligations_pkey PRIMARY KEY (id);


--
-- Name: raw_messages raw_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.raw_messages
    ADD CONSTRAINT raw_messages_pkey PRIMARY KEY (id);


--
-- Name: savings_goals savings_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.savings_goals
    ADD CONSTRAINT savings_goals_pkey PRIMARY KEY (id);


--
-- Name: training_examples training_examples_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.training_examples
    ADD CONSTRAINT training_examples_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: ix_account_aliases_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_account_aliases_id ON public.account_aliases USING btree (id);


--
-- Name: ix_accounts_last_4_digits; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_accounts_last_4_digits ON public.accounts USING btree (last_4_digits);


--
-- Name: ix_payments_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_payments_id ON public.payments USING btree (id);


--
-- Name: account_aliases account_aliases_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_aliases
    ADD CONSTRAINT account_aliases_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: account_audits account_audits_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_audits
    ADD CONSTRAINT account_audits_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: currency_wallets currency_wallets_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.currency_wallets
    ADD CONSTRAINT currency_wallets_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: payments obligation_history_obligation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT obligation_history_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES public.obligations(id);


--
-- Name: payments payments_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);


--
-- Name: transactions transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- PostgreSQL database dump complete
--

\unrestrict m0N3jBYCCDZjhCCEkisQ3ezf9dVyZQsqqizwgiCfSlaLRvjiif1dlynM6a1OGe4

