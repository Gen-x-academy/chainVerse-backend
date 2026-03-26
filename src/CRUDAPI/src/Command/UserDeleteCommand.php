<?php

namespace App\Command;

use App\Repository\UserRepository;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:user-delete',
    description: 'Delete a user',
)]
class UserDeleteCommand extends Command
{
    public function __construct(private UserRepository $userRepo)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this
            ->addArgument('username', InputArgument::REQUIRED, 'Username of the user');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $username = $input->getArgument('username');
        $user = $this->userRepo->findOneByUsername($username);
        if (!$user) {
            $io->error('User with this username does not exist');
            return Command::FAILURE;
        }

        $this->userRepo->remove($user, true);

        $io->success('User was successfully deleted.');

        return Command::SUCCESS;
    }
}
