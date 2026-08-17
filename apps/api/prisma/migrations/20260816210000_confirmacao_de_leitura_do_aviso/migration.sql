-- Confirmação de leitura de aviso.
--
-- Os avisos continuam derivados: não há tabela de notificação, e nada aqui gera aviso. O que
-- se guarda é só a leitura — qual aviso a pessoa disse ter visto, e em que estado ele estava.
--
-- A `assinatura` é o que impede a confirmação de virar um silenciador permanente. Ela resume
-- o conteúdo do aviso; se o motivo mudar (a dívida atrasada que recebeu um pagamento parcial
-- e agora cobra outro valor), a assinatura muda junto e o aviso volta a aparecer. Sem ela,
-- marcar "Aluguel atrasado" como lido calaria aquele aluguel para sempre.
CREATE TABLE "NoticeRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "assinatura" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeRead_pkey" PRIMARY KEY ("id")
);

-- Uma linha por aviso: reconfirmar sobrescreve a assinatura em vez de acumular histórico.
CREATE UNIQUE INDEX "NoticeRead_userId_noticeId_key" ON "NoticeRead"("userId", "noticeId");
CREATE INDEX "NoticeRead_userId_idx" ON "NoticeRead"("userId");

ALTER TABLE "NoticeRead" ADD CONSTRAINT "NoticeRead_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
