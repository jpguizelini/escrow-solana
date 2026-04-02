use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};

declare_id!("4gcCzSgtJ9zBesZK5BXCD5TzCfuNXz9MHWsax6NjjrKK");

#[program]
pub mod escrow {
    use super::*;

    /// Instrução para criar um escrow (Make)
    pub fn make(ctx: Context<Make>, seed: u64, deposit: u64, receive: u64) -> Result<()> {
        require!(deposit > 0 && receive > 0, EscrowError::InvalidAmount);

        ctx.accounts.escrow_state.set_inner(EscrowState {
            seed,
            maker: ctx.accounts.maker.key(),
            mint_a: ctx.accounts.mint_a.key(),
            mint_b: ctx.accounts.mint_b.key(),
            receive,
            bump: ctx.bumps.escrow_state,
        });

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.maker_ata_a.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint_a.to_account_info(),
            authority: ctx.accounts.maker.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer_checked(cpi_ctx, deposit, ctx.accounts.mint_a.decimals)?;

        Ok(())
    }

    /// Instrução para aceitar um escrow (Take)
    pub fn take(ctx: Context<Take>) -> Result<()> {
        let receive = ctx.accounts.escrow_state.receive;

        // Taker envia Mint B para o Maker
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.taker_ata_b.to_account_info(),
            to: ctx.accounts.maker_ata_b.to_account_info(),
            mint: ctx.accounts.mint_b.to_account_info(),
            authority: ctx.accounts.taker.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer_checked(cpi_ctx, receive, ctx.accounts.mint_b.decimals)?;

        // Vault envia Mint A para o Taker
        let vault_amount = ctx.accounts.vault.amount;
        let maker_key = ctx.accounts.escrow_state.maker;
        let seed = ctx.accounts.escrow_state.seed;
        let bump = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow",
            maker_key.as_ref(),
            &seed.to_le_bytes(),
            &[bump],
        ]];

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.taker_ata_a.to_account_info(),
            mint: ctx.accounts.mint_a.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        transfer_checked(cpi_ctx, vault_amount, ctx.accounts.mint_a.decimals)?;

        // Fecha o vault
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        close_account(cpi_ctx)?;

        Ok(())
    }

    /// Instrução para cancelar e reembolsar um escrow (Refund)
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let vault_amount = ctx.accounts.vault.amount;
        let maker_key = ctx.accounts.maker.key();
        let seed = ctx.accounts.escrow_state.seed;
        let bump = ctx.accounts.escrow_state.bump;

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"escrow",
            maker_key.as_ref(),
            &seed.to_le_bytes(),
            &[bump],
        ]];

        // Devolve Mint A para o Maker
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.maker_ata_a.to_account_info(),
            mint: ctx.accounts.mint_a.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        transfer_checked(cpi_ctx, vault_amount, ctx.accounts.mint_a.decimals)?;

        // Fecha o vault
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = CloseAccount {
            account: ctx.accounts.vault.to_account_info(),
            destination: ctx.accounts.maker.to_account_info(),
            authority: ctx.accounts.escrow_state.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        close_account(cpi_ctx)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint_a: InterfaceAccount<'info, Mint>,

    #[account(mint::token_program = token_program)]
    pub mint_b: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = maker,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        init,
        payer = maker,
        associated_token::mint = mint_a,
        associated_token::authority = escrow_state,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Take<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(mut)]
    pub maker: SystemAccount<'info>,

    pub mint_a: Box<InterfaceAccount<'info, Mint>>,
    pub mint_b: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_a,
        associated_token::authority = taker,
        associated_token::token_program = token_program
    )]
    pub taker_ata_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = taker,
        associated_token::token_program = token_program
    )]
    pub taker_ata_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = taker,
        associated_token::mint = mint_b,
        associated_token::authority = maker,
        associated_token::token_program = token_program
    )]
    pub maker_ata_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        close = maker,
        has_one = maker,
        has_one = mint_a,
        has_one = mint_b,
        seeds = [b"escrow", maker.key().as_ref(), escrow_state.seed.to_le_bytes().as_ref()],
        bump = escrow_state.bump
    )]
    pub escrow_state: Box<Account<'info, EscrowState>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = escrow_state,
        associated_token::token_program = token_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    #[account(mint::token_program = token_program)]
    pub mint_a: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = maker,
        has_one = maker,
        has_one = mint_a,
        seeds = [b"escrow", maker.key().as_ref(), escrow_state.seed.to_le_bytes().as_ref()],
        bump = escrow_state.bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = escrow_state,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub seed: u64,
    pub maker: Pubkey,
    pub mint_a: Pubkey,
    pub mint_b: Pubkey,
    pub receive: u64,
    pub bump: u8,
}

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
}