# Authorization Guide

Authorization is split into three layers. Keep them separate.

1. Authentication: protected controllers use `JwtAuthGuard`.
2. Account capability: scoped write routes use `@RequireScopes(...)`.
3. Resource authorization: services check the concrete document role, such as room member or room owner.

## Guard Order

Do not register `ScopesGuard` as a global `APP_GUARD`.

Global guards run before controller guards. If `ScopesGuard` runs globally, it can execute before `JwtAuthGuard`, see no `request.user`, and reject valid users with 403.

For controllers with scoped endpoints, register guards in this order:

```ts
@UseGuards(JwtAuthGuard, ScopesGuard)
```

Then add `@RequireScopes(...)` on mutating endpoints. Routes without `@RequireScopes(...)` pass the scope guard after authentication.

## Scope Map

| Action                                                      | Scope                         |
| ----------------------------------------------------------- | ----------------------------- |
| Create a trip room                                          | `room:create`                 |
| Update room settings, destination, invite, selected course  | `room:admin` plus owner check |
| Add or remove candidate places                              | `candidate:write`             |
| Create, edit, reorder, delete, or batch-save schedule items | `schedule:write`              |
| Use Duri generation or optimization APIs                    | `duri:use`                    |
| Read saved places                                           | `save:read`                   |
| Save or unsave a place                                      | `save:write`                  |
| Update profile or onboarding state                          | `profile:write`               |

Example:

```ts
@UseGuards(JwtAuthGuard, ScopesGuard)
@Controller('rooms')
export class RoomsController {
  @Post()
  @RequireScopes('room:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(user.userId, dto);
  }
}
```

## Resource Checks

Scopes describe what an account type may generally do. They do not prove that the user owns a specific room.

For room admin actions, check both:

```ts
@RequireScopes('room:admin')
```

and in the service:

```ts
const room = await this.getRoomForMember(roomId, userId);
this.assertRoomOwner(room, userId);
```

Guests may have `candidate:write`, so they can add their own candidate places to rooms they joined. Guests do not have `room:create`, `room:admin`, `schedule:write`, `save:write`, or `duri:use`.

## Checklist

- Add `@RequireScopes(...)` to mutating routes.
- Put `@UseGuards(JwtAuthGuard, ScopesGuard)` on controllers that contain scoped routes.
- Keep that guard order: JWT first, scopes second.
- Check resource membership or ownership in the service.
- Do not rely on hidden frontend buttons as authorization.
- Add a negative test for missing scope or non-owner role.
