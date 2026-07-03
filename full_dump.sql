--
-- PostgreSQL database dump
--

-- Dumped from database version 14.17
-- Dumped by pg_dump version 14.17

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

ALTER TABLE IF EXISTS ONLY public.saga_steps DROP CONSTRAINT IF EXISTS saga_steps_transaction_id_fkey;
ALTER TABLE IF EXISTS ONLY public.rides DROP CONSTRAINT IF EXISTS rides_passenger_id_fkey;
ALTER TABLE IF EXISTS ONLY public.rides DROP CONSTRAINT IF EXISTS rides_driver_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ride_events DROP CONSTRAINT IF EXISTS ride_events_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ride_events DROP CONSTRAINT IF EXISTS ride_events_parent_event_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ride_delegation DROP CONSTRAINT IF EXISTS ride_delegation_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ride_auction DROP CONSTRAINT IF EXISTS ride_auction_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ratings DROP CONSTRAINT IF EXISTS ratings_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.location_history DROP CONSTRAINT IF EXISTS location_history_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.error_log DROP CONSTRAINT IF EXISTS error_log_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.distributed_transactions DROP CONSTRAINT IF EXISTS distributed_transactions_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.consensus_state DROP CONSTRAINT IF EXISTS consensus_state_ride_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auction_proposals DROP CONSTRAINT IF EXISTS auction_proposals_motorista_id_fkey;
ALTER TABLE IF EXISTS ONLY public.auction_proposals DROP CONSTRAINT IF EXISTS auction_proposals_auction_id_fkey;
DROP TRIGGER IF EXISTS trigger_update_rides_timestamp ON public.rides;
DROP TRIGGER IF EXISTS trigger_update_passengers_timestamp ON public.passengers;
DROP TRIGGER IF EXISTS trigger_update_drivers_timestamp ON public.drivers;
CREATE OR REPLACE VIEW public.v_driver_performance AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(255) AS nome,
    NULL::character varying(100) AS servico_proprietario,
    NULL::bigint AS total_corridas,
    NULL::bigint AS corridas_completadas,
    NULL::numeric AS avaliacao_media,
    NULL::bigint AS corridas_canceladas;
CREATE OR REPLACE VIEW public.v_rides_status AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(20) AS status,
    NULL::character varying(255) AS nome_passageiro,
    NULL::character varying(255) AS nome_motorista,
    NULL::text AS origem_endereco,
    NULL::text AS destino_endereco,
    NULL::numeric(10,2) AS preco_estimado,
    NULL::timestamp without time zone AS data_criacao,
    NULL::character varying(100) AS servico_proprietario,
    NULL::bigint AS total_eventos;
DROP INDEX IF EXISTS public.idx_saga_steps_transaction;
DROP INDEX IF EXISTS public.idx_saga_steps_status;
DROP INDEX IF EXISTS public.idx_saga_steps_servico;
DROP INDEX IF EXISTS public.idx_rides_status_servico;
DROP INDEX IF EXISTS public.idx_rides_status;
DROP INDEX IF EXISTS public.idx_rides_servico_proprietario;
DROP INDEX IF EXISTS public.idx_rides_saga_id;
DROP INDEX IF EXISTS public.idx_rides_passenger_status;
DROP INDEX IF EXISTS public.idx_rides_passenger;
DROP INDEX IF EXISTS public.idx_rides_driver;
DROP INDEX IF EXISTS public.idx_rides_distributed_transaction_id;
DROP INDEX IF EXISTS public.idx_rides_delegada_para;
DROP INDEX IF EXISTS public.idx_rides_data_criacao;
DROP INDEX IF EXISTS public.idx_ride_events_type;
DROP INDEX IF EXISTS public.idx_ride_events_servico;
DROP INDEX IF EXISTS public.idx_ride_events_ride_type;
DROP INDEX IF EXISTS public.idx_ride_events_ride_id;
DROP INDEX IF EXISTS public.idx_ride_events_lamport_clock;
DROP INDEX IF EXISTS public.idx_ride_events_data_criacao;
DROP INDEX IF EXISTS public.idx_ride_delegation_servicos;
DROP INDEX IF EXISTS public.idx_ride_delegation_ride;
DROP INDEX IF EXISTS public.idx_ride_auction_status;
DROP INDEX IF EXISTS public.idx_ride_auction_servico_solicitante;
DROP INDEX IF EXISTS public.idx_ride_auction_ride;
DROP INDEX IF EXISTS public.idx_ride_auction_deadline;
DROP INDEX IF EXISTS public.idx_ratings_ride;
DROP INDEX IF EXISTS public.idx_ratings_avaliador;
DROP INDEX IF EXISTS public.idx_ratings_avaliado;
DROP INDEX IF EXISTS public.idx_passengers_status;
DROP INDEX IF EXISTS public.idx_passengers_email;
DROP INDEX IF EXISTS public.idx_passengers_data_criacao;
DROP INDEX IF EXISTS public.idx_partner_services_status;
DROP INDEX IF EXISTS public.idx_partner_services_servico_nome;
DROP INDEX IF EXISTS public.idx_metrics_log_timestamp;
DROP INDEX IF EXISTS public.idx_metrics_log_servico;
DROP INDEX IF EXISTS public.idx_metrics_log_metrica;
DROP INDEX IF EXISTS public.idx_location_history_usuario;
DROP INDEX IF EXISTS public.idx_location_history_timestamp;
DROP INDEX IF EXISTS public.idx_location_history_ride;
DROP INDEX IF EXISTS public.idx_error_log_timestamp;
DROP INDEX IF EXISTS public.idx_error_log_severidade;
DROP INDEX IF EXISTS public.idx_error_log_servico;
DROP INDEX IF EXISTS public.idx_error_log_ride;
DROP INDEX IF EXISTS public.idx_drivers_status_servico;
DROP INDEX IF EXISTS public.idx_drivers_status;
DROP INDEX IF EXISTS public.idx_drivers_servico_proprietario;
DROP INDEX IF EXISTS public.idx_drivers_placa;
DROP INDEX IF EXISTS public.idx_drivers_numero_motorista;
DROP INDEX IF EXISTS public.idx_drivers_localizacao;
DROP INDEX IF EXISTS public.idx_drivers_data_criacao;
DROP INDEX IF EXISTS public.idx_distributed_transactions_status;
DROP INDEX IF EXISTS public.idx_distributed_transactions_ride;
DROP INDEX IF EXISTS public.idx_distributed_transactions_coordinator;
DROP INDEX IF EXISTS public.idx_distributed_locks_status;
DROP INDEX IF EXISTS public.idx_distributed_locks_resource;
DROP INDEX IF EXISTS public.idx_distributed_locks_owner;
DROP INDEX IF EXISTS public.idx_distributed_locks_expires_at;
DROP INDEX IF EXISTS public.idx_consensus_state_ride;
DROP INDEX IF EXISTS public.idx_consensus_state_consenso_alcancado;
DROP INDEX IF EXISTS public.idx_circuit_breakers_servico;
DROP INDEX IF EXISTS public.idx_circuit_breakers_estado;
DROP INDEX IF EXISTS public.idx_auction_proposals_servico;
DROP INDEX IF EXISTS public.idx_auction_proposals_selecionado;
DROP INDEX IF EXISTS public.idx_auction_proposals_auction;
ALTER TABLE IF EXISTS ONLY public.saga_steps DROP CONSTRAINT IF EXISTS saga_steps_pkey;
ALTER TABLE IF EXISTS ONLY public.rides DROP CONSTRAINT IF EXISTS rides_pkey;
ALTER TABLE IF EXISTS ONLY public.ride_events DROP CONSTRAINT IF EXISTS ride_events_pkey;
ALTER TABLE IF EXISTS ONLY public.ride_delegation DROP CONSTRAINT IF EXISTS ride_delegation_pkey;
ALTER TABLE IF EXISTS ONLY public.ride_auction DROP CONSTRAINT IF EXISTS ride_auction_pkey;
ALTER TABLE IF EXISTS ONLY public.ratings DROP CONSTRAINT IF EXISTS ratings_pkey;
ALTER TABLE IF EXISTS ONLY public.passengers DROP CONSTRAINT IF EXISTS passengers_pkey;
ALTER TABLE IF EXISTS ONLY public.passengers DROP CONSTRAINT IF EXISTS passengers_email_key;
ALTER TABLE IF EXISTS ONLY public.passengers DROP CONSTRAINT IF EXISTS passengers_cpf_key;
ALTER TABLE IF EXISTS ONLY public.partner_services DROP CONSTRAINT IF EXISTS partner_services_servico_nome_key;
ALTER TABLE IF EXISTS ONLY public.partner_services DROP CONSTRAINT IF EXISTS partner_services_pkey;
ALTER TABLE IF EXISTS ONLY public.metrics_log DROP CONSTRAINT IF EXISTS metrics_log_pkey;
ALTER TABLE IF EXISTS ONLY public.location_history DROP CONSTRAINT IF EXISTS location_history_pkey;
ALTER TABLE IF EXISTS ONLY public.error_log DROP CONSTRAINT IF EXISTS error_log_pkey;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_placa_veiculo_key;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_pkey;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_habilitacao_numero_key;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_cpf_key;
ALTER TABLE IF EXISTS ONLY public.distributed_transactions DROP CONSTRAINT IF EXISTS distributed_transactions_pkey;
ALTER TABLE IF EXISTS ONLY public.distributed_locks DROP CONSTRAINT IF EXISTS distributed_locks_pkey;
ALTER TABLE IF EXISTS ONLY public.consensus_state DROP CONSTRAINT IF EXISTS consensus_state_pkey;
ALTER TABLE IF EXISTS ONLY public.consensus_state DROP CONSTRAINT IF EXISTS consensus_state_consensus_id_key;
ALTER TABLE IF EXISTS ONLY public.circuit_breakers DROP CONSTRAINT IF EXISTS circuit_breakers_servico_alvo_key;
ALTER TABLE IF EXISTS ONLY public.circuit_breakers DROP CONSTRAINT IF EXISTS circuit_breakers_pkey;
ALTER TABLE IF EXISTS ONLY public.auction_proposals DROP CONSTRAINT IF EXISTS auction_proposals_pkey;
DROP VIEW IF EXISTS public.v_unprocessed_events;
DROP VIEW IF EXISTS public.v_service_statistics;
DROP VIEW IF EXISTS public.v_rides_status;
DROP VIEW IF EXISTS public.v_driver_performance;
DROP TABLE IF EXISTS public.saga_steps;
DROP TABLE IF EXISTS public.rides;
DROP TABLE IF EXISTS public.ride_events;
DROP TABLE IF EXISTS public.ride_delegation;
DROP TABLE IF EXISTS public.ride_auction;
DROP TABLE IF EXISTS public.ratings;
DROP TABLE IF EXISTS public.passengers;
DROP TABLE IF EXISTS public.partner_services;
DROP TABLE IF EXISTS public.metrics_log;
DROP TABLE IF EXISTS public.location_history;
DROP TABLE IF EXISTS public.error_log;
DROP TABLE IF EXISTS public.drivers;
DROP TABLE IF EXISTS public.distributed_transactions;
DROP TABLE IF EXISTS public.distributed_locks;
DROP TABLE IF EXISTS public.consensus_state;
DROP TABLE IF EXISTS public.circuit_breakers;
DROP TABLE IF EXISTS public.auction_proposals;
DROP FUNCTION IF EXISTS public.update_timestamp();
DROP EXTENSION IF EXISTS pgcrypto;
--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.data_atualizacao = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auction_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auction_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auction_id uuid NOT NULL,
    servico_nome character varying(100) NOT NULL,
    motorista_id uuid,
    preco_estimado numeric(10,2) NOT NULL,
    eta_minutos integer NOT NULL,
    tempo_deslocamento_ate_passageiro integer,
    taxa_aceitacao numeric(5,2),
    selecionado boolean DEFAULT false,
    motivo_nao_selecionado text,
    received_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    timestamp_logico bigint,
    dados_proposta jsonb
);


--
-- Name: circuit_breakers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circuit_breakers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    servico_alvo character varying(100) NOT NULL,
    instancia_alvo character varying(100),
    estado character varying(20) DEFAULT 'CLOSED'::character varying NOT NULL,
    failure_count integer DEFAULT 0,
    success_count integer DEFAULT 0,
    request_count integer DEFAULT 0,
    failure_threshold integer DEFAULT 5,
    success_threshold integer DEFAULT 2,
    timeout_seconds integer DEFAULT 60,
    last_failure_at timestamp without time zone,
    opened_at timestamp without time zone,
    half_open_at timestamp without time zone,
    closed_at timestamp without time zone,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ultima_mensagem_erro text,
    CONSTRAINT circuit_breakers_estado_check CHECK (((estado)::text = ANY ((ARRAY['CLOSED'::character varying, 'OPEN'::character varying, 'HALF_OPEN'::character varying])::text[])))
);


--
-- Name: consensus_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consensus_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consensus_id character varying(100) NOT NULL,
    ride_id uuid,
    numero_participantes integer NOT NULL,
    numero_votos_sim integer DEFAULT 0,
    numero_votos_nao integer DEFAULT 0,
    consenso_alcancado boolean DEFAULT false,
    resultado text,
    lamport_clock bigint,
    vector_clock jsonb,
    data_inicio timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_resultado timestamp without time zone
);


--
-- Name: distributed_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distributed_locks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_id character varying(100) NOT NULL,
    resource_type character varying(50) NOT NULL,
    owner_service character varying(100) NOT NULL,
    owner_instance character varying(100),
    owner_process_id character varying(100),
    acquired_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    released_at timestamp without time zone,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    tentativa_numero integer DEFAULT 1,
    tempo_espera_ms bigint,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT distributed_locks_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'RELEASED'::character varying, 'EXPIRED'::character varying, 'FORCEFULLY_RELEASED'::character varying])::text[])))
);


--
-- Name: distributed_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distributed_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ride_id uuid,
    transaction_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'STARTED'::character varying NOT NULL,
    coordinator_service character varying(100) NOT NULL,
    participating_services text[],
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    prepared_at timestamp without time zone,
    completed_at timestamp without time zone,
    failed_at timestamp without time zone,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    lamport_clock bigint DEFAULT 0,
    vector_clock jsonb,
    CONSTRAINT distributed_transactions_status_check CHECK (((status)::text = ANY ((ARRAY['STARTED'::character varying, 'PREPARE'::character varying, 'PREPARED'::character varying, 'COMMIT_REQUESTED'::character varying, 'COMMITTED'::character varying, 'ROLLBACK_REQUESTED'::character varying, 'ABORTED'::character varying, 'COMPENSATED'::character varying, 'FAILED'::character varying])::text[]))),
    CONSTRAINT distributed_transactions_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['2PC'::character varying, 'SAGA'::character varying])::text[])))
);


--
-- Name: drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome character varying(255) NOT NULL,
    telefone character varying(20) NOT NULL,
    cpf character varying(14) NOT NULL,
    placa_veiculo character varying(10) NOT NULL,
    modelo_veiculo character varying(100) NOT NULL,
    ano_veiculo integer NOT NULL,
    cor_veiculo character varying(50),
    capacidade_passageiros integer DEFAULT 4,
    latitude numeric(10,8),
    longitude numeric(11,8),
    ultima_atualizacao_localizacao timestamp without time zone,
    status character varying(20) DEFAULT 'OFFLINE'::character varying,
    disponivel_desde timestamp without time zone,
    avaliacao_media numeric(3,2) DEFAULT 5.00,
    total_avaliacoes integer DEFAULT 0,
    total_corridas_completadas integer DEFAULT 0,
    total_corridas_canceladas integer DEFAULT 0,
    taxa_cancelamento numeric(5,2) DEFAULT 0.00,
    servico_proprietario character varying(100) NOT NULL,
    numero_motorista_no_servico integer,
    habilitacao_numero character varying(20) NOT NULL,
    habilitacao_valida_ate date NOT NULL,
    registro_veiculo_numero character varying(50),
    status_verificacao character varying(20) DEFAULT 'PENDENTE'::character varying,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    criado_por_servico character varying(100),
    lamport_clock bigint DEFAULT 0,
    CONSTRAINT drivers_avaliacao_media_check CHECK (((avaliacao_media >= (0)::numeric) AND (avaliacao_media <= (5)::numeric))),
    CONSTRAINT drivers_capacidade_passageiros_check CHECK (((capacidade_passageiros > 0) AND (capacidade_passageiros <= 8))),
    CONSTRAINT drivers_status_check CHECK (((status)::text = ANY ((ARRAY['AVAILABLE'::character varying, 'BUSY'::character varying, 'OFFLINE'::character varying])::text[]))),
    CONSTRAINT drivers_status_verificacao_check CHECK (((status_verificacao)::text = ANY ((ARRAY['PENDENTE'::character varying, 'VERIFICADO'::character varying, 'REJEITADO'::character varying, 'SUSPENSO'::character varying])::text[])))
);


--
-- Name: error_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    servico_nome character varying(100) NOT NULL,
    instancia_id character varying(100),
    ride_id uuid,
    tipo_erro character varying(100),
    mensagem_erro text NOT NULL,
    stack_trace text,
    nivel_severidade character varying(20),
    trace_id character varying(100),
    parent_span_id character varying(100),
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT error_log_nivel_severidade_check CHECK (((nivel_severidade)::text = ANY ((ARRAY['DEBUG'::character varying, 'INFO'::character varying, 'WARNING'::character varying, 'ERROR'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: location_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ride_id uuid,
    usuario_id uuid,
    usuario_tipo character varying(20),
    latitude numeric(10,8) NOT NULL,
    longitude numeric(11,8) NOT NULL,
    accuracy_metros numeric(10,2),
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT location_history_usuario_tipo_check CHECK (((usuario_tipo)::text = ANY ((ARRAY['DRIVER'::character varying, 'PASSENGER'::character varying])::text[])))
);


--
-- Name: metrics_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metrics_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    servico_nome character varying(100) NOT NULL,
    metrica_nome character varying(100) NOT NULL,
    metrica_valor numeric(20,4),
    metrica_valor_inteiro bigint,
    metrica_valor_texto character varying(255),
    tags jsonb,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: partner_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    servico_nome character varying(100) NOT NULL,
    descricao text,
    endpoint_base_url character varying(500) NOT NULL,
    protocolo character varying(20) DEFAULT 'HTTP'::character varying,
    porta integer,
    api_key character varying(255),
    api_secret character varying(255),
    metodo_autenticacao character varying(50),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    last_healthcheck timestamp without time zone,
    healthcheck_interval_seconds integer DEFAULT 30,
    numero_motoristas integer DEFAULT 10,
    motoristas_disponiveis integer DEFAULT 0,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT partner_services_protocolo_check CHECK (((protocolo)::text = ANY ((ARRAY['HTTP'::character varying, 'GRPC'::character varying, 'KAFKA'::character varying, 'AMQP'::character varying])::text[]))),
    CONSTRAINT partner_services_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'MAINTENANCE'::character varying, 'UNREACHABLE'::character varying])::text[])))
);


--
-- Name: passengers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passengers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    telefone character varying(20) NOT NULL,
    senha_hash character varying(255) NOT NULL,
    cpf character varying(14),
    foto_url text,
    metodo_pagamento character varying(50),
    avaliacao_media numeric(3,2) DEFAULT 5.00,
    total_avaliacoes integer DEFAULT 0,
    total_corridas integer DEFAULT 0,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    criado_por_servico character varying(100),
    atualizado_por_servico character varying(100),
    lamport_clock bigint DEFAULT 0,
    CONSTRAINT email_format CHECK (((email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'::text)),
    CONSTRAINT passengers_avaliacao_media_check CHECK (((avaliacao_media >= (0)::numeric) AND (avaliacao_media <= (5)::numeric))),
    CONSTRAINT passengers_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUSPENDED'::character varying, 'INACTIVE'::character varying, 'BANNED'::character varying])::text[])))
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ride_id uuid NOT NULL,
    avaliador_id uuid NOT NULL,
    avaliador_tipo character varying(20) NOT NULL,
    avaliado_id uuid NOT NULL,
    avaliado_tipo character varying(20) NOT NULL,
    estrelas integer NOT NULL,
    comentario text,
    categorias jsonb,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ratings_avaliado_tipo_check CHECK (((avaliado_tipo)::text = ANY ((ARRAY['PASSENGER'::character varying, 'DRIVER'::character varying])::text[]))),
    CONSTRAINT ratings_avaliador_tipo_check CHECK (((avaliador_tipo)::text = ANY ((ARRAY['PASSENGER'::character varying, 'DRIVER'::character varying])::text[]))),
    CONSTRAINT ratings_estrelas_check CHECK (((estrelas >= 1) AND (estrelas <= 5)))
);


--
-- Name: ride_auction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ride_auction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ride_id uuid NOT NULL,
    servico_solicitante character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'STARTED'::character varying NOT NULL,
    servico_vencedor character varying(100),
    motivo_selecao text,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deadline timestamp without time zone NOT NULL,
    closed_at timestamp without time zone,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    lamport_clock bigint DEFAULT 0,
    vector_clock jsonb,
    CONSTRAINT ride_auction_status_check CHECK (((status)::text = ANY ((ARRAY['STARTED'::character varying, 'WAITING_PROPOSALS'::character varying, 'EVALUATING'::character varying, 'CLOSED'::character varying, 'TIMEOUT'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: ride_delegation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ride_delegation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ride_id uuid NOT NULL,
    servico_origem character varying(100) NOT NULL,
    servico_destino character varying(100) NOT NULL,
    motivo_delegacao character varying(100),
    lamport_clock bigint,
    vector_clock jsonb,
    data_delegacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_aceite timestamp without time zone,
    aceita boolean DEFAULT false
);


--
-- Name: ride_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ride_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ride_id uuid NOT NULL,
    event_type character varying(50) NOT NULL,
    servico_origem character varying(100) NOT NULL,
    instancia_servico character varying(100),
    descricao text,
    dados_evento jsonb,
    lamport_clock bigint NOT NULL,
    vector_clock jsonb,
    parent_event_id uuid,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_processamento timestamp without time zone,
    CONSTRAINT ride_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['RIDE_REQUESTED'::character varying, 'LOCK_ACQUIRED'::character varying, 'LOCK_RELEASED'::character varying, 'LOCK_TIMEOUT'::character varying, 'AUCTION_STARTED'::character varying, 'PROPOSAL_RECEIVED'::character varying, 'PROPOSAL_TIMEOUT'::character varying, 'WINNER_SELECTED'::character varying, 'WINNER_REJECTED'::character varying, 'SAGA_STARTED'::character varying, 'SAGA_STEP_EXECUTED'::character varying, 'SAGA_COMPENSATION_TRIGGERED'::character varying, 'SAGA_COMPLETED'::character varying, 'SAGA_FAILED'::character varying, 'DRIVER_ASSIGNED'::character varying, 'DRIVER_FAILED'::character varying, 'FALLBACK_TRIGGERED'::character varying, 'RIDE_COMPLETED'::character varying, 'RIDE_CANCELLED'::character varying, 'RIDE_REASSIGNED'::character varying, 'CIRCUIT_BREAKER_OPENED'::character varying, 'CIRCUIT_BREAKER_HALF_OPEN'::character varying, 'CIRCUIT_BREAKER_CLOSED'::character varying, 'SERVICE_UNREACHABLE'::character varying])::text[])))
);


--
-- Name: rides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    passenger_id uuid NOT NULL,
    driver_id uuid,
    origem_latitude numeric(10,8) NOT NULL,
    origem_longitude numeric(11,8) NOT NULL,
    origem_endereco text NOT NULL,
    destino_latitude numeric(10,8) NOT NULL,
    destino_longitude numeric(11,8) NOT NULL,
    destino_endereco text NOT NULL,
    distancia_estimada_km numeric(10,2),
    preco_estimado numeric(10,2) NOT NULL,
    preco_final numeric(10,2),
    moeda character varying(3) DEFAULT 'BRL'::character varying,
    metodo_pagamento character varying(50),
    eta_minutos integer,
    tempo_espera_minutos integer DEFAULT 0,
    tempo_viagem_minutos integer,
    status character varying(20) DEFAULT 'REQUESTED'::character varying NOT NULL,
    servico_proprietario character varying(100) NOT NULL,
    delegada_para character varying(100),
    distributed_transaction_id uuid,
    saga_id uuid,
    lamport_clock bigint DEFAULT 0,
    vector_clock jsonb,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_matching timestamp without time zone,
    data_confirmacao timestamp without time zone,
    data_inicio_viagem timestamp without time zone,
    data_conclusao timestamp without time zone,
    data_cancelamento timestamp without time zone,
    data_atualizacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    avaliacao_passageiro integer,
    avaliacao_motorista integer,
    comentario_avaliacao text,
    tentativas_alocacao integer DEFAULT 0,
    motivo_cancelamento text,
    motivo_falha text,
    CONSTRAINT rides_avaliacao_motorista_check CHECK (((avaliacao_motorista >= 1) AND (avaliacao_motorista <= 5))),
    CONSTRAINT rides_avaliacao_passageiro_check CHECK (((avaliacao_passageiro >= 1) AND (avaliacao_passageiro <= 5))),
    CONSTRAINT rides_status_check CHECK (((status)::text = ANY ((ARRAY['REQUESTED'::character varying, 'MATCHING'::character varying, 'CONFIRMED'::character varying, 'IN_TRANSIT'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying, 'FAILED'::character varying])::text[])))
);


--
-- Name: saga_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saga_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    passo_numero integer NOT NULL,
    servico_nome character varying(100) NOT NULL,
    acao text NOT NULL,
    acao_compensacao text,
    parametros_acao jsonb,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    data_execucao timestamp without time zone,
    data_compensacao timestamp without time zone,
    data_criacao timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resultado_execucao jsonb,
    erro_mensagem text,
    CONSTRAINT saga_steps_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'EXECUTING'::character varying, 'EXECUTED'::character varying, 'COMPENSATING'::character varying, 'COMPENSATED'::character varying, 'FAILED'::character varying, 'TIMEOUT'::character varying])::text[])))
);


--
-- Name: v_driver_performance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_driver_performance AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(255) AS nome,
    NULL::character varying(100) AS servico_proprietario,
    NULL::bigint AS total_corridas,
    NULL::bigint AS corridas_completadas,
    NULL::numeric AS avaliacao_media,
    NULL::bigint AS corridas_canceladas;


--
-- Name: v_rides_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_rides_status AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(20) AS status,
    NULL::character varying(255) AS nome_passageiro,
    NULL::character varying(255) AS nome_motorista,
    NULL::text AS origem_endereco,
    NULL::text AS destino_endereco,
    NULL::numeric(10,2) AS preco_estimado,
    NULL::timestamp without time zone AS data_criacao,
    NULL::character varying(100) AS servico_proprietario,
    NULL::bigint AS total_eventos;


--
-- Name: v_service_statistics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_service_statistics AS
 SELECT rides.servico_proprietario,
    count(*) AS total_corridas,
    sum(
        CASE
            WHEN ((rides.status)::text = 'COMPLETED'::text) THEN 1
            ELSE 0
        END) AS corridas_completadas,
    sum(
        CASE
            WHEN ((rides.status)::text = 'CANCELLED'::text) THEN 1
            ELSE 0
        END) AS corridas_canceladas,
    avg(rides.preco_estimado) AS preco_medio,
    count(DISTINCT rides.passenger_id) AS passageiros_unicos
   FROM public.rides
  WHERE (rides.data_criacao >= (now() - '7 days'::interval))
  GROUP BY rides.servico_proprietario;


--
-- Name: v_unprocessed_events; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_unprocessed_events AS
 SELECT re.id,
    re.ride_id,
    re.event_type,
    re.servico_origem,
    re.data_criacao,
    re.lamport_clock
   FROM public.ride_events re
  WHERE (re.data_processamento IS NULL)
  ORDER BY re.lamport_clock;


--
-- Data for Name: auction_proposals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auction_proposals (id, auction_id, servico_nome, motorista_id, preco_estimado, eta_minutos, tempo_deslocamento_ate_passageiro, taxa_aceitacao, selecionado, motivo_nao_selecionado, received_at, timestamp_logico, dados_proposta) FROM stdin;
\.


--
-- Data for Name: circuit_breakers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.circuit_breakers (id, servico_alvo, instancia_alvo, estado, failure_count, success_count, request_count, failure_threshold, success_threshold, timeout_seconds, last_failure_at, opened_at, half_open_at, closed_at, data_atualizacao, ultima_mensagem_erro) FROM stdin;
ba48dee8-65e8-4c2f-af84-72f6b36f3a00	SERVICE_A	\N	CLOSED	0	0	0	5	2	60	\N	\N	\N	\N	2026-05-16 13:06:01.289778	\N
fa3c0ea0-c312-46ed-9882-27efaf8a656b	SERVICE_B	\N	CLOSED	0	0	0	5	2	60	\N	\N	\N	\N	2026-05-16 13:06:01.289778	\N
746705b4-d8d5-4809-9920-02e3240ca30f	SERVICE_C	\N	CLOSED	0	0	0	5	2	60	\N	\N	\N	\N	2026-05-16 13:06:01.289778	\N
\.


--
-- Data for Name: consensus_state; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.consensus_state (id, consensus_id, ride_id, numero_participantes, numero_votos_sim, numero_votos_nao, consenso_alcancado, resultado, lamport_clock, vector_clock, data_inicio, data_resultado) FROM stdin;
\.


--
-- Data for Name: distributed_locks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.distributed_locks (id, resource_id, resource_type, owner_service, owner_instance, owner_process_id, acquired_at, expires_at, released_at, status, tentativa_numero, tempo_espera_ms, data_criacao) FROM stdin;
\.


--
-- Data for Name: distributed_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.distributed_transactions (id, ride_id, transaction_type, status, coordinator_service, participating_services, started_at, prepared_at, completed_at, failed_at, data_atualizacao, lamport_clock, vector_clock) FROM stdin;
\.


--
-- Data for Name: drivers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.drivers (id, nome, telefone, cpf, placa_veiculo, modelo_veiculo, ano_veiculo, cor_veiculo, capacidade_passageiros, latitude, longitude, ultima_atualizacao_localizacao, status, disponivel_desde, avaliacao_media, total_avaliacoes, total_corridas_completadas, total_corridas_canceladas, taxa_cancelamento, servico_proprietario, numero_motorista_no_servico, habilitacao_numero, habilitacao_valida_ate, registro_veiculo_numero, status_verificacao, data_criacao, data_atualizacao, criado_por_servico, lamport_clock) FROM stdin;
70ed158a-017a-4e47-b11a-e08950a47ee8	Jose	34999990009	11111111109	AAA1A09	Nissan Versa	2019	Prata	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	9	CNH0009	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.348986	\N	0
40d10c22-3053-4087-a292-55694a792885	Lucas Pereira	34999990007	11111111107	AAA1A07	Renault Kwid	2023	Branco	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	7	CNH0007	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.352206	\N	0
43c94d14-d682-44ec-83ac-de8b05484a40	Maria Oliveira	34999990002	11111111102	AAA1A02	Honda Civic	2019	Preto	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	2	CNH0002	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.354157	\N	0
f0ed6494-238a-474a-9ae4-a6adc3f66f8f	Ricardo Alves	34999990005	11111111105	AAA1A05	Volkswagen Polo	2020	Cinza	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	5	CNH0005	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.357916	\N	0
20f674e2-7d6c-4f47-b5e6-9a3893d328ff	Jo├åo Silva	34999990001	11111111101	AAA1A01	Toyota Corolla	2020	Prata	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	1	CNH0001	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.346839	\N	0
690522d6-6583-4386-b561-aefc64ae5315	Fernanda Lima	34999990004	11111111104	AAA1A04	Chevrolet Onix	2022	Vermelho	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	4	CNH0004	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.34506	\N	0
ceb3768f-6158-480d-a68c-6a825c8a738e	Juliana Costa	34999990006	11111111106	AAA1A06	Fiat Argo	2021	Azul	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	6	CNH0006	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.350659	\N	0
4a4bc073-6b9f-4ecf-9f25-ae21cba9e724	Patr┬ícia Gomes	34999990008	11111111108	AAA1A08	Jeep Renegade	2022	Preto	4	\N	\N	\N	BUSY	\N	5.00	0	0	0	0.00	SERVICE_A	8	CNH0008	2030-12-31	\N	PENDENTE	2026-05-16 13:10:02.03842	2026-05-18 23:15:07.356377	\N	0
\.

UPDATE public.drivers
SET
    status = 'AVAILABLE',
    disponivel_desde = CURRENT_TIMESTAMP,
    status_verificacao = 'VERIFICADO';

INSERT INTO public.drivers (
    id,
    nome,
    telefone,
    cpf,
    placa_veiculo,
    modelo_veiculo,
    ano_veiculo,
    cor_veiculo,
    capacidade_passageiros,
    status,
    disponivel_desde,
    avaliacao_media,
    total_avaliacoes,
    total_corridas_completadas,
    total_corridas_canceladas,
    taxa_cancelamento,
    servico_proprietario,
    numero_motorista_no_servico,
    habilitacao_numero,
    habilitacao_valida_ate,
    status_verificacao,
    data_criacao,
    data_atualizacao,
    lamport_clock
)
SELECT
    gen_random_uuid(),
    'Motorista Extra ' || n,
    '34999' || lpad(n::text, 6, '0'),
    '222222' || lpad(n::text, 5, '0'),
    'RFA' || lpad(n::text, 4, '0'),
    'Chevrolet Onix',
    2022,
    'Branco',
    4,
    'AVAILABLE',
    CURRENT_TIMESTAMP,
    5.00,
    0,
    0,
    0,
    0.00,
    'SERVICE_A',
    n,
    'CNH' || lpad(n::text, 4, '0'),
    DATE '2030-12-31',
    'VERIFICADO',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    0
FROM generate_series(9, 30) AS n;


--
-- Data for Name: error_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.error_log (id, servico_nome, instancia_id, ride_id, tipo_erro, mensagem_erro, stack_trace, nivel_severidade, trace_id, parent_span_id, data_criacao) FROM stdin;
\.


--
-- Data for Name: location_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.location_history (id, ride_id, usuario_id, usuario_tipo, latitude, longitude, accuracy_metros, "timestamp") FROM stdin;
\.


--
-- Data for Name: metrics_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.metrics_log (id, servico_nome, metrica_nome, metrica_valor, metrica_valor_inteiro, metrica_valor_texto, tags, "timestamp") FROM stdin;
\.


--
-- Data for Name: partner_services; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.partner_services (id, servico_nome, descricao, endpoint_base_url, protocolo, porta, api_key, api_secret, metodo_autenticacao, status, last_healthcheck, healthcheck_interval_seconds, numero_motoristas, motoristas_disponiveis, data_criacao, data_atualizacao) FROM stdin;
dbbcbb3f-9576-4ba0-a93f-5c1646c7154e	SERVICE_A	ServiÔÇío Principal A	http://localhost:3000	HTTP	\N	\N	\N	\N	ACTIVE	\N	30	10	10	2026-05-16 13:06:01.268796	2026-05-16 13:06:01.268796
3cb26699-011a-4835-a643-f7d0b58bd1f0	SERVICE_B	ServiÔÇío Principal B	http://localhost:3001	HTTP	\N	\N	\N	\N	ACTIVE	\N	30	10	10	2026-05-16 13:06:01.268796	2026-05-16 13:06:01.268796
0714fb89-2253-4c0c-b718-b8859293f409	SERVICE_C	ServiÔÇío Principal C	http://localhost:3002	HTTP	\N	\N	\N	\N	ACTIVE	\N	30	10	10	2026-05-16 13:06:01.268796	2026-05-16 13:06:01.268796
\.


--
-- Data for Name: passengers; Type: TABLE DATA; Schema: public; Owner: -
--

UPDATE public.partner_services
SET
    numero_motoristas = 30,
    motoristas_disponiveis = 30
WHERE servico_nome = 'SERVICE_A';

COPY public.passengers (id, nome, email, telefone, senha_hash, cpf, foto_url, metodo_pagamento, avaliacao_media, total_avaliacoes, total_corridas, status, data_criacao, data_atualizacao, criado_por_servico, atualizado_por_servico, lamport_clock) FROM stdin;
\.


--
-- Data for Name: ratings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ratings (id, ride_id, avaliador_id, avaliador_tipo, avaliado_id, avaliado_tipo, estrelas, comentario, categorias, data_criacao) FROM stdin;
\.


--
-- Data for Name: ride_auction; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ride_auction (id, ride_id, servico_solicitante, status, servico_vencedor, motivo_selecao, started_at, deadline, closed_at, data_atualizacao, lamport_clock, vector_clock) FROM stdin;
\.


--
-- Data for Name: ride_delegation; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ride_delegation (id, ride_id, servico_origem, servico_destino, motivo_delegacao, lamport_clock, vector_clock, data_delegacao, data_aceite, aceita) FROM stdin;
\.


--
-- Data for Name: ride_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ride_events (id, ride_id, event_type, servico_origem, instancia_servico, descricao, dados_evento, lamport_clock, vector_clock, parent_event_id, data_criacao, data_processamento) FROM stdin;
\.


--
-- Data for Name: rides; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rides (id, passenger_id, driver_id, origem_latitude, origem_longitude, origem_endereco, destino_latitude, destino_longitude, destino_endereco, distancia_estimada_km, preco_estimado, preco_final, moeda, metodo_pagamento, eta_minutos, tempo_espera_minutos, tempo_viagem_minutos, status, servico_proprietario, delegada_para, distributed_transaction_id, saga_id, lamport_clock, vector_clock, data_criacao, data_matching, data_confirmacao, data_inicio_viagem, data_conclusao, data_cancelamento, data_atualizacao, avaliacao_passageiro, avaliacao_motorista, comentario_avaliacao, tentativas_alocacao, motivo_cancelamento, motivo_falha) FROM stdin;
\.


--
-- Data for Name: saga_steps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.saga_steps (id, transaction_id, passo_numero, servico_nome, acao, acao_compensacao, parametros_acao, status, data_execucao, data_compensacao, data_criacao, resultado_execucao, erro_mensagem) FROM stdin;
\.


--
-- Name: auction_proposals auction_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auction_proposals
    ADD CONSTRAINT auction_proposals_pkey PRIMARY KEY (id);


--
-- Name: circuit_breakers circuit_breakers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuit_breakers
    ADD CONSTRAINT circuit_breakers_pkey PRIMARY KEY (id);


--
-- Name: circuit_breakers circuit_breakers_servico_alvo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuit_breakers
    ADD CONSTRAINT circuit_breakers_servico_alvo_key UNIQUE (servico_alvo);


--
-- Name: consensus_state consensus_state_consensus_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consensus_state
    ADD CONSTRAINT consensus_state_consensus_id_key UNIQUE (consensus_id);


--
-- Name: consensus_state consensus_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consensus_state
    ADD CONSTRAINT consensus_state_pkey PRIMARY KEY (id);


--
-- Name: distributed_locks distributed_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributed_locks
    ADD CONSTRAINT distributed_locks_pkey PRIMARY KEY (id);


--
-- Name: distributed_transactions distributed_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributed_transactions
    ADD CONSTRAINT distributed_transactions_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_cpf_key UNIQUE (cpf);


--
-- Name: drivers drivers_habilitacao_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_habilitacao_numero_key UNIQUE (habilitacao_numero);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_placa_veiculo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_placa_veiculo_key UNIQUE (placa_veiculo);


--
-- Name: error_log error_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_log
    ADD CONSTRAINT error_log_pkey PRIMARY KEY (id);


--
-- Name: location_history location_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT location_history_pkey PRIMARY KEY (id);


--
-- Name: metrics_log metrics_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metrics_log
    ADD CONSTRAINT metrics_log_pkey PRIMARY KEY (id);


--
-- Name: partner_services partner_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_services
    ADD CONSTRAINT partner_services_pkey PRIMARY KEY (id);


--
-- Name: partner_services partner_services_servico_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_services
    ADD CONSTRAINT partner_services_servico_nome_key UNIQUE (servico_nome);


--
-- Name: passengers passengers_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passengers
    ADD CONSTRAINT passengers_cpf_key UNIQUE (cpf);


--
-- Name: passengers passengers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passengers
    ADD CONSTRAINT passengers_email_key UNIQUE (email);


--
-- Name: passengers passengers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passengers
    ADD CONSTRAINT passengers_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ride_auction ride_auction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ride_auction
    ADD CONSTRAINT ride_auction_pkey PRIMARY KEY (id);


--
-- Name: ride_delegation ride_delegation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ride_delegation
    ADD CONSTRAINT ride_delegation_pkey PRIMARY KEY (id);


--
-- Name: ride_events ride_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ride_events
    ADD CONSTRAINT ride_events_pkey PRIMARY KEY (id);


--
-- Name: rides rides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_pkey PRIMARY KEY (id);


--
-- Name: saga_steps saga_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saga_steps
    ADD CONSTRAINT saga_steps_pkey PRIMARY KEY (id);


--
-- Name: idx_auction_proposals_auction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auction_proposals_auction ON public.auction_proposals USING btree (auction_id);


--
-- Name: idx_auction_proposals_selecionado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auction_proposals_selecionado ON public.auction_proposals USING btree (selecionado);


--
-- Name: idx_auction_proposals_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auction_proposals_servico ON public.auction_proposals USING btree (servico_nome);


--
-- Name: idx_circuit_breakers_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_circuit_breakers_estado ON public.circuit_breakers USING btree (estado);


--
-- Name: idx_circuit_breakers_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_circuit_breakers_servico ON public.circuit_breakers USING btree (servico_alvo);


--
-- Name: idx_consensus_state_consenso_alcancado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consensus_state_consenso_alcancado ON public.consensus_state USING btree (consenso_alcancado);


--
-- Name: idx_consensus_state_ride; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consensus_state_ride ON public.consensus_state USING btree (ride_id);


--
-- Name: idx_distributed_locks_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distributed_locks_expires_at ON public.distributed_locks USING btree (expires_at);


--
-- Name: idx_distributed_locks_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distributed_locks_owner ON public.distributed_locks USING btree (owner_service);


--
-- Name: idx_distributed_locks_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distributed_locks_resource ON public.distributed_locks USING btree (resource_id, resource_type);


--
-- Name: idx_distributed_locks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distributed_locks_status ON public.distributed_locks USING btree (status);


--
-- Name: idx_distributed_transactions_coordinator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distributed_transactions_coordinator ON public.distributed_transactions USING btree (coordinator_service);


--
-- Name: idx_distributed_transactions_ride; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distributed_transactions_ride ON public.distributed_transactions USING btree (ride_id);


--
-- Name: idx_distributed_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distributed_transactions_status ON public.distributed_transactions USING btree (status);


--
-- Name: idx_drivers_data_criacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_data_criacao ON public.drivers USING btree (data_criacao);


--
-- Name: idx_drivers_localizacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_localizacao ON public.drivers USING btree (latitude, longitude);


--
-- Name: idx_drivers_numero_motorista; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_numero_motorista ON public.drivers USING btree (servico_proprietario, numero_motorista_no_servico);


--
-- Name: idx_drivers_placa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_placa ON public.drivers USING btree (placa_veiculo);


--
-- Name: idx_drivers_servico_proprietario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_servico_proprietario ON public.drivers USING btree (servico_proprietario);


--
-- Name: idx_drivers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_status ON public.drivers USING btree (status);


--
-- Name: idx_drivers_status_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_status_servico ON public.drivers USING btree (status, servico_proprietario);


--
-- Name: idx_error_log_ride; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_ride ON public.error_log USING btree (ride_id);


--
-- Name: idx_error_log_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_servico ON public.error_log USING btree (servico_nome);


--
-- Name: idx_error_log_severidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_severidade ON public.error_log USING btree (nivel_severidade);


--
-- Name: idx_error_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_log_timestamp ON public.error_log USING btree (data_criacao);


--
-- Name: idx_location_history_ride; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_ride ON public.location_history USING btree (ride_id);


--
-- Name: idx_location_history_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_timestamp ON public.location_history USING btree ("timestamp");


--
-- Name: idx_location_history_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_history_usuario ON public.location_history USING btree (usuario_id);


--
-- Name: idx_metrics_log_metrica; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metrics_log_metrica ON public.metrics_log USING btree (metrica_nome);


--
-- Name: idx_metrics_log_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metrics_log_servico ON public.metrics_log USING btree (servico_nome);


--
-- Name: idx_metrics_log_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metrics_log_timestamp ON public.metrics_log USING btree ("timestamp");


--
-- Name: idx_partner_services_servico_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_services_servico_nome ON public.partner_services USING btree (servico_nome);


--
-- Name: idx_partner_services_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_services_status ON public.partner_services USING btree (status);


--
-- Name: idx_passengers_data_criacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passengers_data_criacao ON public.passengers USING btree (data_criacao);


--
-- Name: idx_passengers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passengers_email ON public.passengers USING btree (email);


--
-- Name: idx_passengers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passengers_status ON public.passengers USING btree (status);


--
-- Name: idx_ratings_avaliado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_avaliado ON public.ratings USING btree (avaliado_id);


--
-- Name: idx_ratings_avaliador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_avaliador ON public.ratings USING btree (avaliador_id);


--
-- Name: idx_ratings_ride; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_ride ON public.ratings USING btree (ride_id);


--
-- Name: idx_ride_auction_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_auction_deadline ON public.ride_auction USING btree (deadline);


--
-- Name: idx_ride_auction_ride; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_auction_ride ON public.ride_auction USING btree (ride_id);


--
-- Name: idx_ride_auction_servico_solicitante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_auction_servico_solicitante ON public.ride_auction USING btree (servico_solicitante);


--
-- Name: idx_ride_auction_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_auction_status ON public.ride_auction USING btree (status);


--
-- Name: idx_ride_delegation_ride; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_delegation_ride ON public.ride_delegation USING btree (ride_id);


--
-- Name: idx_ride_delegation_servicos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_delegation_servicos ON public.ride_delegation USING btree (servico_origem, servico_destino);


--
-- Name: idx_ride_events_data_criacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_events_data_criacao ON public.ride_events USING btree (data_criacao);


--
-- Name: idx_ride_events_lamport_clock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_events_lamport_clock ON public.ride_events USING btree (lamport_clock);


--
-- Name: idx_ride_events_ride_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_events_ride_id ON public.ride_events USING btree (ride_id);


--
-- Name: idx_ride_events_ride_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_events_ride_type ON public.ride_events USING btree (ride_id, event_type);


--
-- Name: idx_ride_events_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_events_servico ON public.ride_events USING btree (servico_origem);


--
-- Name: idx_ride_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ride_events_type ON public.ride_events USING btree (event_type);


--
-- Name: idx_rides_data_criacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_data_criacao ON public.rides USING btree (data_criacao);


--
-- Name: idx_rides_delegada_para; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_delegada_para ON public.rides USING btree (delegada_para);


--
-- Name: idx_rides_distributed_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_distributed_transaction_id ON public.rides USING btree (distributed_transaction_id);


--
-- Name: idx_rides_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_driver ON public.rides USING btree (driver_id);


--
-- Name: idx_rides_passenger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_passenger ON public.rides USING btree (passenger_id);


--
-- Name: idx_rides_passenger_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_passenger_status ON public.rides USING btree (passenger_id, status);


--
-- Name: idx_rides_saga_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_saga_id ON public.rides USING btree (saga_id);


--
-- Name: idx_rides_servico_proprietario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_servico_proprietario ON public.rides USING btree (servico_proprietario);


--
-- Name: idx_rides_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_status ON public.rides USING btree (status);


--
-- Name: idx_rides_status_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rides_status_servico ON public.rides USING btree (status, servico_proprietario);


--
-- Name: idx_saga_steps_servico; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saga_steps_servico ON public.saga_steps USING btree (servico_nome);


--
-- Name: idx_saga_steps_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saga_steps_status ON public.saga_steps USING btree (status);


--
-- Name: idx_saga_steps_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saga_steps_transaction ON public.saga_steps USING btree (transaction_id);


--
-- Name: v_rides_status _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_rides_status AS
 SELECT r.id,
    r.status,
    p.nome AS nome_passageiro,
    d.nome AS nome_motorista,
    r.origem_endereco,
    r.destino_endereco,
    r.preco_estimado,
    r.data_criacao,
    r.servico_proprietario,
    count(re.id) AS total_eventos
   FROM (((public.rides r
     LEFT JOIN public.passengers p ON ((r.passenger_id = p.id)))
     LEFT JOIN public.drivers d ON ((r.driver_id = d.id)))
     LEFT JOIN public.ride_events re ON ((r.id = re.ride_id)))
  GROUP BY r.id, p.id, d.id;


--
-- Name: v_driver_performance _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_driver_performance AS
 SELECT d.id,
    d.nome,
    d.servico_proprietario,
    count(r.id) AS total_corridas,
    sum(
        CASE
            WHEN ((r.status)::text = 'COMPLETED'::text) THEN 1
            ELSE 0
        END) AS corridas_completadas,
    avg(d.avaliacao_media) AS avaliacao_media,
    sum(
        CASE
            WHEN ((r.status)::text = 'CANCELLED'::text) THEN 1
            ELSE 0
        END) AS corridas_canceladas
   FROM (public.drivers d
     LEFT JOIN public.rides r ON ((d.id = r.driver_id)))
  WHERE (d.data_criacao >= (now() - '30 days'::interval))
  GROUP BY d.id;


--
-- Name: drivers trigger_update_drivers_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_drivers_timestamp BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: passengers trigger_update_passengers_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_passengers_timestamp BEFORE UPDATE ON public.passengers FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: rides trigger_update_rides_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_rides_timestamp BEFORE UPDATE ON public.rides FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: auction_proposals auction_proposals_auction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auction_proposals
    ADD CONSTRAINT auction_proposals_auction_id_fkey FOREIGN KEY (auction_id) REFERENCES public.ride_auction(id) ON DELETE CASCADE;


--
-- Name: auction_proposals auction_proposals_motorista_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auction_proposals
    ADD CONSTRAINT auction_proposals_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES public.drivers(id) ON DELETE SET NULL;


--
-- Name: consensus_state consensus_state_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consensus_state
    ADD CONSTRAINT consensus_state_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE;


--
-- Name: distributed_transactions distributed_transactions_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distributed_transactions
    ADD CONSTRAINT distributed_transactions_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE;


--
-- Name: error_log error_log_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_log
    ADD CONSTRAINT error_log_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL;


--
-- Name: location_history location_history_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_history
    ADD CONSTRAINT location_history_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE;


--
-- Name: ride_auction ride_auction_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ride_auction
    ADD CONSTRAINT ride_auction_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE;


--
-- Name: ride_delegation ride_delegation_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ride_delegation
    ADD CONSTRAINT ride_delegation_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE;


--
-- Name: ride_events ride_events_parent_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ride_events
    ADD CONSTRAINT ride_events_parent_event_id_fkey FOREIGN KEY (parent_event_id) REFERENCES public.ride_events(id) ON DELETE SET NULL;


--
-- Name: ride_events ride_events_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ride_events
    ADD CONSTRAINT ride_events_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE CASCADE;


--
-- Name: rides rides_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;


--
-- Name: rides rides_passenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_passenger_id_fkey FOREIGN KEY (passenger_id) REFERENCES public.passengers(id) ON DELETE RESTRICT;


--
-- Name: saga_steps saga_steps_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saga_steps
    ADD CONSTRAINT saga_steps_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.distributed_transactions(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

