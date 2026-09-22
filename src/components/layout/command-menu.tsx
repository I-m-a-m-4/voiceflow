'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Home, Users, CreditCard, Settings, Bot, FileText, Settings2 } from 'lucide-react';
import { useUser } from '@/firebase';

interface CommandMenuProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: Home, roles: ['admin', 'manager', 'vendor_operator'] },
    { href: '/zen-ai', label: 'Zen AI Assistant', icon: Bot, roles: ['admin', 'manager', 'vendor_operator'] },
    { href: '/dashboard/meetings', label: 'My Meetings', icon: FileText, roles: ['admin', 'manager', 'vendor_operator'] },
    { href: '/users', label: 'Users & Staff', icon: Users, roles: ['admin'] },
    { href: '/billing', label: 'Billing', icon: CreditCard, roles: ['admin'] },
    { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export default function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
    const router = useRouter();
    // Assuming simple role simulation or fetching from useUser context if needed.
    const { user } = useUser();
    const userRole = 'admin'; // Temporarily hardcoded until auth claims are fully implemented for VoiceFlow

    const runCommand = React.useCallback((command: () => unknown) => {
        onOpenChange(false);
        command();
    }, [onOpenChange]);

    const visibleNavLinks = React.useMemo(() => {
        if (!userRole) return [];
        return navLinks.filter(link => link.roles.includes(userRole));
    }, [userRole]);

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Navigation">
                    {visibleNavLinks.map(link => (
                        <CommandItem key={link.href} value={link.label} onSelect={() => runCommand(() => router.push(link.href))}>
                           <link.icon className="mr-2 h-4 w-4" />
                           <span>{link.label}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
